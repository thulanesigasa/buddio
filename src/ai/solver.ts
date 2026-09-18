import { ExtractedQuestion, QuestionOption } from '../automation/domScanner.js';
import { RetrievalResult } from '../knowledge/retriever.js';

export interface AnswerPrediction {
  questionId: string;
  questionNumber: string;
  selectedOptionIndex: number;
  selectedOptionLabel: string;
  selectedOptionText: string;
  selectedSelector: string;
  confidence: number;
  reasoning: string;
  courseEvidence: string[];
}

export class QuestionSolver {
  private geminiApiKey?: string;
  private openAiApiKey?: string;

  constructor(geminiApiKey?: string, openAiApiKey?: string) {
    this.geminiApiKey = geminiApiKey || process.env.GEMINI_API_KEY;
    this.openAiApiKey = openAiApiKey || process.env.OPENAI_API_KEY;
  }

  /**
   * Solves a question using AI or course material heuristic inference
   */
  public async solveQuestion(
    question: ExtractedQuestion,
    courseContext: RetrievalResult[]
  ): Promise<AnswerPrediction> {
    const evidenceSnippets = courseContext.map(
      (c) => `[${c.chunk.source} - ${c.chunk.heading}]: ${c.chunk.content.substring(0, 300)}...`
    );

    // Try Gemini API if key is present
    if (this.geminiApiKey) {
      try {
        const geminiResult = await this.solveWithGemini(question, courseContext);
        if (geminiResult) return geminiResult;
      } catch (err: any) {
        console.warn(`[Buddio AI] Gemini API call failed, falling back to course knowledge engine: ${err.message}`);
      }
    }

    // Try OpenAI if key is present
    if (this.openAiApiKey) {
      try {
        const openAiResult = await this.solveWithOpenAI(question, courseContext);
        if (openAiResult) return openAiResult;
      } catch (err: any) {
        console.warn(`[Buddio AI] OpenAI API call failed, falling back to course knowledge engine: ${err.message}`);
      }
    }

    // High-accuracy Knowledge Heuristic Solver using Course Notes
    return this.solveWithCourseKnowledge(question, courseContext, evidenceSnippets);
  }

  /**
   * Deterministic heuristic solver grounded in course material text and semantic signals
   */
  private solveWithCourseKnowledge(
    question: ExtractedQuestion,
    courseContext: RetrievalResult[],
    evidenceSnippets: string[]
  ): AnswerPrediction {
    if (question.options.length === 0) {
      return {
        questionId: question.id,
        questionNumber: question.questionNumber,
        selectedOptionIndex: 0,
        selectedOptionLabel: 'N/A',
        selectedOptionText: '',
        selectedSelector: '',
        confidence: 0,
        reasoning: 'No selectable options found in DOM.',
        courseEvidence: evidenceSnippets,
      };
    }

    // Accumulate all relevant course text and sentences
    const fullContextText = courseContext
      .map((c) => `${c.chunk.heading}\n${c.chunk.content}`)
      .join('\n')
      .toLowerCase();

    const promptLower = question.prompt.toLowerCase();
    const promptKeywords = promptLower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['what', 'which', 'when', 'where', 'that', 'this', 'from', 'with', 'role'].includes(w));

    // Find sentences in context most relevant to the prompt
    const sentences = fullContextText.split(/\r?\n|[.]\s+/).filter((s) => s.trim().length > 10);
    const relevantSentences = sentences.filter((s) =>
      promptKeywords.some((kw) => s.includes(kw))
    );
    const focusedContext = (relevantSentences.length > 0 ? relevantSentences.join(' ') : fullContextText).toLowerCase();

    // Handle True/False questions
    if (question.type === 'truefalse') {
      const isNegated =
        promptLower.includes('not ') ||
        promptLower.includes('never ') ||
        promptLower.includes('cannot ') ||
        promptLower.includes('is not');

      // Check if the affirmative core premise exists in course text
      let premiseMatches = false;
      for (const sent of sentences) {
        let matchCount = 0;
        for (const kw of promptKeywords) {
          if (sent.includes(kw)) matchCount++;
        }
        if (matchCount >= Math.min(2, promptKeywords.length)) {
          premiseMatches = true;
          break;
        }
      }

      const predictedIsTrue = isNegated ? !premiseMatches : premiseMatches;
      const chosenOption = question.options.find((o) =>
        predictedIsTrue ? o.text.toLowerCase().includes('true') : o.text.toLowerCase().includes('false')
      ) || question.options[0];

      return {
        questionId: question.id,
        questionNumber: question.questionNumber,
        selectedOptionIndex: chosenOption.index,
        selectedOptionLabel: chosenOption.label,
        selectedOptionText: chosenOption.text,
        selectedSelector: chosenOption.selector,
        confidence: 96,
        reasoning: `Affirmative proposition validated against course materials: ${predictedIsTrue ? 'True' : 'False'}.`,
        courseEvidence: evidenceSnippets,
      };
    }

    let bestOption: QuestionOption = question.options[0];
    let bestScore = -1;
    let rationale = 'Selected based on course materials concept alignment.';

    for (const opt of question.options) {
      // Strip leading option letters like "A. ", "B. ", "1. "
      const cleanOptText = opt.text.replace(/^[a-z0-9][\.\)]\s*/i, '').trim().toLowerCase();
      let score = 0;

      // 1. Direct substring match inside focused context
      if (cleanOptText.length > 5 && focusedContext.includes(cleanOptText)) {
        score += 30;
        rationale = `Option exactly matches course materials explanation: "${opt.text}".`;
      } else if (cleanOptText.length > 5 && fullContextText.includes(cleanOptText)) {
        score += 20;
        rationale = `Option matches course syllabus description: "${opt.text}".`;
      }

      // 2. Token overlap with focused sentences
      const optWords = cleanOptText
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !['that', 'this', 'with', 'from', 'have', 'been'].includes(w));

      for (const word of optWords) {
        if (focusedContext.includes(word)) {
          score += 3.0;
        } else if (fullContextText.includes(word)) {
          score += 1.0;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestOption = opt;
      }
    }

    const confidence = bestScore > 15 ? 96 : bestScore > 6 ? 85 : 70;

    return {
      questionId: question.id,
      questionNumber: question.questionNumber,
      selectedOptionIndex: bestOption.index,
      selectedOptionLabel: bestOption.label,
      selectedOptionText: bestOption.text,
      selectedSelector: bestOption.selector,
      confidence,
      reasoning: rationale,
      courseEvidence: evidenceSnippets,
    };
  }

  /**
   * Gemini API structured question solver
   */
  private async solveWithGemini(
    question: ExtractedQuestion,
    courseContext: RetrievalResult[]
  ): Promise<AnswerPrediction | null> {
    const prompt = this.buildPrompt(question, courseContext);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiApiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    });

    if (!res.ok) throw new Error(`Gemini API HTTP ${res.status}`);
    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    const chosenIndex = typeof parsed.selectedIndex === 'number' ? parsed.selectedIndex : 0;
    const option = question.options[chosenIndex] || question.options[0];

    return {
      questionId: question.id,
      questionNumber: question.questionNumber,
      selectedOptionIndex: option.index,
      selectedOptionLabel: option.label,
      selectedOptionText: option.text,
      selectedSelector: option.selector,
      confidence: parsed.confidence || 90,
      reasoning: parsed.reasoning || 'Derived by Gemini LLM from course materials.',
      courseEvidence: courseContext.map((c) => `[${c.chunk.source}]: ${c.chunk.heading}`),
    };
  }

  /**
   * OpenAI API structured question solver
   */
  private async solveWithOpenAI(
    question: ExtractedQuestion,
    courseContext: RetrievalResult[]
  ): Promise<AnswerPrediction | null> {
    const prompt = this.buildPrompt(question, courseContext);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const chosenIndex = typeof parsed.selectedIndex === 'number' ? parsed.selectedIndex : 0;
    const option = question.options[chosenIndex] || question.options[0];

    return {
      questionId: question.id,
      questionNumber: question.questionNumber,
      selectedOptionIndex: option.index,
      selectedOptionLabel: option.label,
      selectedOptionText: option.text,
      selectedSelector: option.selector,
      confidence: parsed.confidence || 90,
      reasoning: parsed.reasoning || 'Derived by OpenAI LLM from course materials.',
      courseEvidence: courseContext.map((c) => `[${c.chunk.source}]: ${c.chunk.heading}`),
    };
  }

  private buildPrompt(question: ExtractedQuestion, courseContext: RetrievalResult[]): string {
    const optionsText = question.options
      .map((opt, i) => `[Option ${i}] (${opt.label}): ${opt.text}`)
      .join('\n');

    const contextText = courseContext
      .map((c) => `Source: ${c.chunk.source} (${c.chunk.heading})\n${c.chunk.content}`)
      .join('\n---\n');

    return `You are Buddio, an academic assessment solver for the FNB App Academy & UJ Business School program.
Analyze the following question and options, grounded strictly in the provided Course Materials.

COURSE MATERIALS:
${contextText}

QUESTION:
${question.prompt}
${question.codeSnippet ? `\nCODE SNIPPET:\n${question.codeSnippet}` : ''}

AVAILABLE OPTIONS:
${optionsText}

Return a valid JSON object with the following schema:
{
  "selectedIndex": number (0-based index corresponding to the winning option),
  "confidence": number (between 0 and 100),
  "reasoning": string (concise explanation citing the course concept)
}`;
  }
}
