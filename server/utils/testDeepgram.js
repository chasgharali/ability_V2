/**
 * Test script to verify Deepgram integration
 * Run with: node server/utils/testDeepgram.js
 */

// Load environment variables first
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const deepgramService = require('../services/deepgramService');

async function testDeepgram() {
    console.log('\n🧪 Testing Deepgram Integration...\n');
    
    // Test 1: Check if API key is configured
    console.log('Test 1: Checking API key configuration...');
    const isAvailable = deepgramService.isAvailable();
    if (isAvailable) {
        console.log('✅ Deepgram API key is configured');
    } else {
        console.log('❌ Deepgram API key is NOT configured');
        console.log('   Please add DEEPGRAM_API_KEY to your .env file');
        console.log('   Get your API key at: https://console.deepgram.com');
        process.exit(1);
    }
    
    // Test 2: Try to start a test transcription
    console.log('\nTest 2: Testing WebSocket connection...');
    const testConnectionKey = 'test_' + Date.now();
    const testCallId = 'test-call-123';
    const testRoomName = 'test-room';
    const testParticipantId = 'test-participant-1';
    const testParticipantName = 'Test User';
    
    let transcriptionReceived = false;
    let connectionOpened = false;
    
    try {
        const success = await deepgramService.startTranscription(
            testConnectionKey,
            testCallId,
            testRoomName,
            testParticipantId,
            testParticipantName,
            (transcription) => {
                transcriptionReceived = true;
                console.log('✅ Transcription received:', transcription);
            }
        );
        
        if (success) {
            console.log('✅ WebSocket connection opened successfully');
            connectionOpened = true;
            
            // Wait a bit to see if we get any messages
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Send a small test audio chunk (silence)
            console.log('\nTest 3: Sending test audio chunk...');
            const testAudio = Buffer.alloc(3200); // 100ms of 16kHz 16-bit mono audio
            const sent = deepgramService.sendAudio(testConnectionKey, testAudio);
            
            if (sent) {
                console.log('✅ Test audio chunk sent');
            } else {
                console.log('❌ Failed to send test audio chunk');
            }
            
            // Wait a bit more
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Cleanup
            deepgramService.stopTranscription(testConnectionKey);
            console.log('\n✅ Test completed');
            
            if (transcriptionReceived) {
                console.log('✅ Deepgram is working correctly!');
            } else {
                console.log('⚠️  No transcription received (this is normal for silence)');
                console.log('   Try speaking during a real call to test transcription');
            }
        } else {
            console.log('❌ Failed to open WebSocket connection');
            console.log('   Check your API key and network connection');
        }
    } catch (error) {
        console.error('❌ Error during test:', error.message);
        console.error('   Stack:', error.stack);
    }
    
    console.log('\n📊 Test Summary:');
    console.log(`   API Key Configured: ${isAvailable ? '✅' : '❌'}`);
    console.log(`   Connection Opened: ${connectionOpened ? '✅' : '❌'}`);
    console.log(`   Transcription Received: ${transcriptionReceived ? '✅' : '⚠️  (normal for silence)'}`);
    console.log('\n');
}

// Run the test
testDeepgram().catch(console.error);
