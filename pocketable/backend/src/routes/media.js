"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const router = (0, express_1.Router)();
/**
 * Transcribe audio using OpenAI Whisper API
 */
router.post('/transcribe', async (req, res) => {
    try {
        const { audioBase64 } = req.body;
        if (!audioBase64) {
            return res.status(400).json({ error: 'Missing audioBase64 in request body' });
        }
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'OpenAI API key not configured' });
        }
        console.log('🎤 Transcribing audio...');
        // Convert base64 to buffer
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        // Create form data
        const formData = new form_data_1.default();
        formData.append('file', audioBuffer, {
            filename: 'audio.m4a',
            contentType: 'audio/m4a',
        });
        formData.append('model', 'whisper-1');
        // Call Whisper API
        const response = await axios_1.default.post('https://api.openai.com/v1/audio/transcriptions', formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${apiKey}`,
            },
            timeout: 30000,
        });
        const transcription = response.data.text;
        console.log('✅ Transcription complete:', transcription);
        res.json({
            success: true,
            transcription,
        });
    }
    catch (error) {
        console.error('❌ Transcription error:', error);
        if (axios_1.default.isAxiosError(error)) {
            const message = error.response?.data?.error?.message || error.message;
            return res.status(error.response?.status || 500).json({
                error: `Transcription failed: ${message}`,
            });
        }
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
/**
 * Analyze image using Claude or GPT vision
 */
router.post('/analyze-image', async (req, res) => {
    try {
        const { imageBase64, prompt, model = 'claude' } = req.body;
        if (!imageBase64) {
            return res.status(400).json({ error: 'Missing imageBase64 in request body' });
        }
        console.log(`🖼️ Analyzing image with ${model}...`);
        if (model === 'claude') {
            // Use Claude API with vision
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
                return res.status(500).json({ error: 'Claude API key not configured' });
            }
            const response = await axios_1.default.post('https://api.anthropic.com/v1/messages', {
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: 'image/jpeg',
                                    data: imageBase64,
                                },
                            },
                            {
                                type: 'text',
                                text: prompt || 'Describe this image in detail. What elements would be useful for building a mobile app?',
                            },
                        ],
                    },
                ],
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                timeout: 30000,
            });
            const description = response.data.content[0].text;
            console.log('✅ Image analysis complete');
            return res.json({
                success: true,
                description,
            });
        }
        else {
            // Use GPT-4 Vision
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                return res.status(500).json({ error: 'OpenAI API key not configured' });
            }
            const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-5',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: {
                                    url: `data:image/jpeg;base64,${imageBase64}`,
                                },
                            },
                            {
                                type: 'text',
                                text: prompt || 'Describe this image in detail. What elements would be useful for building a mobile app?',
                            },
                        ],
                    },
                ],
                max_tokens: 1024,
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                timeout: 30000,
            });
            const description = response.data.choices[0].message.content;
            console.log('✅ Image analysis complete');
            return res.json({
                success: true,
                description,
            });
        }
    }
    catch (error) {
        console.error('❌ Image analysis error:', error);
        if (axios_1.default.isAxiosError(error)) {
            const message = error.response?.data?.error?.message || error.message;
            return res.status(error.response?.status || 500).json({
                error: `Image analysis failed: ${message}`,
            });
        }
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
exports.default = router;
//# sourceMappingURL=media.js.map