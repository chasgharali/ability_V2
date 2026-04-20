jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

const openaiCaptionService = require('../services/openaiCaptionService');

describe('openaiCaptionService', () => {
    afterEach(async () => {
        await openaiCaptionService.stopTranscription('call1_user1');
    });

    test('pcm16ToWav creates a valid WAV header', () => {
        const pcm = Buffer.from([0, 0, 1, 0, 255, 127, 0, 128]);
        const wav = openaiCaptionService.pcm16ToWav(pcm, 16000, 1);

        expect(wav.subarray(0, 4).toString()).toBe('RIFF');
        expect(wav.subarray(8, 12).toString()).toBe('WAVE');
        expect(wav.subarray(36, 40).toString()).toBe('data');
        expect(wav.length).toBe(44 + pcm.length);
    });

    test('buffers audio and emits deduplicated transcription', async () => {
        openaiCaptionService.available = true;
        openaiCaptionService.client = {};
        openaiCaptionService.minChunkBytes = 4;
        openaiCaptionService.chunkBytes = 4;

        const onTranscription = jest.fn();
        await openaiCaptionService.startTranscription(
            'call1_user1',
            'call1',
            'room1',
            'user1',
            'Recruiter User',
            onTranscription
        );

        const transcribeSpy = jest
            .spyOn(openaiCaptionService, 'transcribeChunk')
            .mockResolvedValueOnce('hello world')
            .mockResolvedValueOnce('hello world')
            .mockResolvedValueOnce('interpreter joined');

        openaiCaptionService.sendAudio('call1_user1', Buffer.from([1, 2, 3, 4]));
        openaiCaptionService.sendAudio('call1_user1', Buffer.from([5, 6, 7, 8]));
        await openaiCaptionService.processConnection('call1_user1', true);
        openaiCaptionService.sendAudio('call1_user1', Buffer.from([9, 10, 11, 12]));
        await openaiCaptionService.processConnection('call1_user1', true);

        expect(transcribeSpy).toHaveBeenCalled();
        expect(onTranscription).toHaveBeenCalled();
        expect(onTranscription.mock.calls[0][0].text).toBe('hello world');

        transcribeSpy.mockRestore();
    });
});
