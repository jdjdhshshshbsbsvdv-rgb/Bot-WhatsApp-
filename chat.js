import fetch from 'node-fetch';
globalThis.fetch = fetch;

const gemini = {
    getNewCookie: async function (retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const r = await fetch("https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c", {
                    "headers": {
                        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    },
                    "body": "f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&",
                    "method": "POST",
                    "timeout": 10000
                });
                const cookieHeader = r.headers.get('set-cookie');
                if (!cookieHeader) throw new Error('No set-cookie header');
                return cookieHeader.split(';')[0];
            } catch (e) {
                if (i === retries - 1) throw e;
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            }
        }
    },

    ask: async function (prompt, previousId = null, retries = 2) {
        if (typeof (prompt) !== "string" || !prompt?.trim()?.length) {
            throw new Error(`Invalid prompt provided.`);
        }

        let resumeArray = null;
        let cookie = null;

        if (previousId) {
            try {
                const s = atob(previousId);
                const j = JSON.parse(s);
                resumeArray = j.newResumeArray;
                cookie = j.cookie;
            } catch (e) {
                previousId = null;
            }
        }

        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const headers = {
                    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "x-goog-ext-525001261-jspb": "[1,null,null,null,\"9ec249fc9ad08861\",null,null,null,[4]]",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "cookie": cookie || await this.getNewCookie()
                };

                const b = [[prompt], ["en-US"], resumeArray];
                const a = [null, JSON.stringify(b)];
                const obj = { "f.req": JSON.stringify(a) };
                const body = new URLSearchParams(obj);

                const response = await fetch(`https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c`, {
                    headers,
                    body,
                    'method': 'post',
                    timeout: 15000
                });

                if (!response.ok) {
                    if (response.status === 429) throw new Error('Rate limited. Please wait.');
                    throw new Error(`API error: ${response.status}`);
                }

                const data = await response.text();
                const match = data.matchAll(/^\d+\n(.+?)\n/gm);

                const chunks = Array.from(match, m => m[1]);
                let text, newResumeArray;
                let found = false;

                for (const chunk of chunks.reverse()) {
                    try {
                        const realArray = JSON.parse(chunk);
                        const parse1 = JSON.parse(realArray[0][2]);

                        if (parse1 && parse1[4] && parse1[4][0] && parse1[4][0][1] && typeof parse1[4][0][1][0] === 'string') {
                            newResumeArray = [...parse1[1], parse1[4][0][0]];
                            text = parse1[4][0][1][0].replace(/\*\*(.+?)\*\*/g, `*$1*`);
                            found = true;
                            break;
                        }
                    } catch (e) {
                        // Continue
                    }
                }

                if (!found) {
                    if (attempt < retries - 1 && previousId) {
                        previousId = null;
                        continue;
                    }
                    throw new Error("No valid response received from API.");
                }

                const id = btoa(JSON.stringify({ newResumeArray, cookie: headers.cookie }));
                return { text, id };
            } catch (e) {
                if (attempt === retries - 1) throw e;
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            }
        }
    }
};

// Auto conversation demo
const runConversation = async () => {
    console.log('🤖 Gemini AI - Full Conversation Demo\n');

    const messages = [
        "Hello! How are you today?",
        "Tell me a joke about programming",
        "What is artificial intelligence?",
        "Can you write a short poem about technology?"
    ];

    let sessionId = null;

    for (const msg of messages) {
        console.log(`\nYou: ${msg}`);
        try {
            process.stdout.write('🤖 ');
            const result = await gemini.ask(msg, sessionId, 3);
            sessionId = result.id;
            console.log(result.text);
            await new Promise(r => setTimeout(r, 2000)); // 2 second delay
        } catch (e) {
            console.error(`❌ Error: ${e.message}`);
            sessionId = null; // Reset on error
            await new Promise(r => setTimeout(r, 3000)); // Wait longer before next attempt
        }
    }

    console.log('\n✅ Conversation complete!\n');
};

runConversation().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
