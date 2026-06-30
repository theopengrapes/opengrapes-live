"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rotationManager = void 0;
exports.transcribeImage = transcribeImage;
exports.requestAI = requestAI;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Unified usage counters for Gemini key rotation
class KeyRotationManager {
    constructor() {
        const rotatedKeys = [
            process.env.GEMINI_KEY_1,
            process.env.GEMINI_KEY_2,
            process.env.GEMINI_KEY_3,
            process.env.GEMINI_KEY_4,
            process.env.GEMINI_KEY_5
        ].filter(Boolean);
        if (rotatedKeys.length > 0) {
            this.keys = rotatedKeys;
            this.isRotationEnabled = true;
        }
        else {
            // Fallback to legacy single key if no rotated keys configured
            this.keys = [process.env.GEMINI_API_KEY || ''].filter(Boolean);
            this.isRotationEnabled = false;
        }
        this.lastResetDate = new Date().toISOString().split('T')[0];
        this.counts = {};
        this.keys.forEach(k => {
            this.counts[k] = { 'gemini-2.5-flash': 0, 'gemini-2.5-flash-lite': 0 };
        });
    }
    checkReset() {
        const today = new Date().toISOString().split('T')[0];
        if (today !== this.lastResetDate) {
            this.lastResetDate = today;
            this.keys.forEach(k => {
                this.counts[k] = { 'gemini-2.5-flash': 0, 'gemini-2.5-flash-lite': 0 };
            });
            console.log(`[KeyRotation] Usage counters reset for new UTC day: ${today}`);
        }
    }
    getNextKey(model) {
        if (!this.isRotationEnabled) {
            return this.keys[0] || null;
        }
        this.checkReset();
        for (const key of this.keys) {
            if (this.counts[key] && this.counts[key][model] < 20) {
                return key;
            }
        }
        return null;
    }
    increment(key, model) {
        if (!this.isRotationEnabled)
            return;
        if (this.counts[key]) {
            this.counts[key][model]++;
            console.log(`[KeyRotation] Key ${key.substring(0, 10)}... incremented for ${model}: ${this.counts[key][model]}/20`);
        }
    }
    exhaust(key, model) {
        if (!this.isRotationEnabled)
            return;
        if (this.counts[key]) {
            this.counts[key][model] = 20;
            console.log(`[KeyRotation] Key ${key.substring(0, 10)}... marked exhausted for ${model} today.`);
        }
    }
}
exports.rotationManager = new KeyRotationManager();
// OCR & Diagram transcription using Gemini rotation
async function transcribeImage(attachedImage) {
    const promptText = "Extract all text verbatim from this JEE/NEET doubt image. Write all mathematical equations, symbols, and formulas in standard LaTeX format. If there is a diagram, graph, or circuit, write a detailed textual description of its components, shapes, values, directions, and connections. Do not solve the question, only output the transcription.";
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
    for (const model of models) {
        let key = exports.rotationManager.getNextKey(model);
        while (key !== null) {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
            try {
                console.log(`[AI Provider OCR] Translating image via Gemini (${model}) using key ${key.substring(0, 10)}...`);
                const geminiBody = {
                    contents: [{
                            role: 'user',
                            parts: [
                                { text: promptText },
                                attachedImage
                            ]
                        }]
                };
                const response = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(geminiBody)
                });
                if (response.status === 429 || response.status === 403) {
                    console.warn(`[AI Provider OCR] Gemini Key exhausted for ${model}. Exclude from rotation today.`);
                    exports.rotationManager.exhaust(key, model);
                    key = exports.rotationManager.getNextKey(model);
                    continue;
                }
                if (!response.ok) {
                    console.warn(`[AI Provider OCR] Gemini API error (status: ${response.status}). Trying next key...`);
                    key = exports.rotationManager.getNextKey(model);
                    continue;
                }
                const data = (await response.json());
                const textVal = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (textVal) {
                    exports.rotationManager.increment(key, model);
                    return textVal;
                }
                // Response succeeded but structure was missing
                key = exports.rotationManager.getNextKey(model);
            }
            catch (fetchErr) {
                console.error(`[AI Provider OCR] Fetch to Gemini key failed:`, fetchErr.message);
                key = exports.rotationManager.getNextKey(model);
            }
        }
    }
    throw new Error('All Gemini API keys exhausted or rate-limited for visual transcription today.');
}
// Unified call routing: Gemini visual parsing layer + SiliconFlow DeepSeek text reasoning layer
async function requestAI(body, options = {}) {
    const streamRequested = options.stream || body.stream || false;
    // 1. Extract visual parts and text parts from input
    let parts = [];
    let systemInstructionText = "";
    if (body.contents && body.contents.length > 0) {
        const lastContent = body.contents[body.contents.length - 1];
        if (lastContent && lastContent.parts) {
            parts = lastContent.parts;
        }
    }
    else if (body.messages && body.messages.length > 0) {
        const lastUserMsg = body.messages.filter((m) => m.role === 'user').pop();
        if (lastUserMsg) {
            if (Array.isArray(lastUserMsg.parts)) {
                parts = lastUserMsg.parts;
            }
            else {
                parts = [{ text: lastUserMsg.content || '' }];
            }
        }
    }
    if (body.systemInstruction) {
        if (typeof body.systemInstruction === 'string') {
            systemInstructionText = body.systemInstruction;
        }
        else if (body.systemInstruction.parts && body.systemInstruction.parts[0]) {
            systemInstructionText = body.systemInstruction.parts[0].text || "";
        }
    }
    const visualParts = parts.filter((p) => p.inlineData || p.fileData);
    const textParts = parts.filter((p) => p.text);
    // 2. Perform OCR transcription via Gemini if visual elements exist
    let visualTranscription = "";
    if (visualParts.length > 0) {
        console.log(`[AI Provider] Found ${visualParts.length} visual attachments. Transcribing via Gemini...`);
        const transcriptions = await Promise.all(visualParts.map((part) => transcribeImage(part)));
        visualTranscription = transcriptions.join("\n\n---\n\n");
    }
    // 3. Construct text-only query payload for DeepSeek
    let finalUserText = textParts.map((p) => p.text).join("\n");
    if (visualTranscription) {
        finalUserText += `\n\n[Visual Image Context (Transcribed by OCR)]\n${visualTranscription}`;
    }
    // Map messages history to standard OpenAI/SiliconFlow format
    let messages = [];
    if (body.messages && body.messages.length > 0) {
        const lastUserIdx = [...body.messages].reverse().findIndex((m) => m.role === 'user');
        const targetIdx = lastUserIdx !== -1 ? body.messages.length - 1 - lastUserIdx : -1;
        messages = body.messages.map((m, idx) => {
            const role = m.role === 'assistant' || m.role === 'model' ? 'assistant' : 'user';
            if (idx === targetIdx) {
                return { role, content: finalUserText };
            }
            return { role, content: m.content || m.parts?.[0]?.text || '' };
        });
    }
    else if (body.contents && body.contents.length > 0) {
        const lastUserIdx = [...body.contents].reverse().findIndex((m) => m.role === 'user');
        const targetIdx = lastUserIdx !== -1 ? body.contents.length - 1 - lastUserIdx : -1;
        messages = body.contents.map((m, idx) => {
            const role = m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user';
            if (idx === targetIdx) {
                return { role, content: finalUserText };
            }
            const textContent = m.parts?.map((p) => p.text || '').join('\n') || '';
            return { role, content: textContent };
        });
    }
    else {
        messages = [{ role: 'user', content: finalUserText }];
    }
    // Add system instruction as system message if present
    if (systemInstructionText) {
        messages.unshift({ role: 'system', content: systemInstructionText });
    }
    // Determine thinking mode based on explicit request parameter or fallback
    const isDoubtRequest = streamRequested || !!systemInstructionText;
    const enableThinking = body.enableThinking !== undefined ? body.enableThinking : isDoubtRequest;
    const deepseekBody = {
        model: process.env.DEEPSEEK_MODEL_NAME || 'deepseek-ai/DeepSeek-V4-Flash',
        messages,
        stream: streamRequested
    };
    if (enableThinking) {
        deepseekBody.enable_thinking = true;
        deepseekBody.reasoning_effort = "high";
    }
    else {
        deepseekBody.enable_thinking = false;
    }
    console.log(`[AI Provider] Routing text reasoning to DeepSeek (thinking: ${deepseekBody.enable_thinking})...`);
    const siliconFlowKey = process.env.DEEPSEEK_API_KEY || '';
    const siliconFlowBaseUrl = (process.env.DEEPSEEK_API_BASE_URL || 'https://api.siliconflow.com/v1').replace(/\/+$/, '');
    const response = await fetch(`${siliconFlowBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${siliconFlowKey}`
        },
        body: JSON.stringify(deepseekBody)
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SiliconFlow DeepSeek API error (${response.status}): ${errorText}`);
    }
    return response;
}
