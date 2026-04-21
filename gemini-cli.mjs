import fetch from 'node-fetch';
import readline from 'readline';

const gemini = {
    getNewCookie: async function () {
        const r = await fetch("https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c", {
            headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: "f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&",
            method: "POST"
        });
        const cookieHeader = r.headers.get('set-cookie');
        if (!cookieHeader) throw new Error('Could not retrieve session cookie.');
        return cookieHeader.split(';')[0];
    },

    ask: async function (prompt, session) {
        if (!prompt?.trim()) throw new Error('Empty prompt.');

        if (!session.cookie) {
            session.cookie = await this.getNewCookie();
        }

        const headers = {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "x-goog-ext-525001261-jspb": "[1,null,null,null,\"9ec249fc9ad08861\",null,null,null,[4]]",
            "cookie": session.cookie
        };

        const b = [[prompt], ["en-US"], session.resumeArray || null];
        const body = new URLSearchParams({ "f.req": JSON.stringify([null, JSON.stringify(b)]) });

        const response = await fetch(
            `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c`,
            { headers, body, method: 'post' }
        );

        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }

        const data = await response.text();
        const chunks = Array.from(data.matchAll(/^\d+\n(.+?)\n/gm), m => m[1]).reverse();

        for (const chunk of chunks) {
            try {
                const realArray = JSON.parse(chunk);
                const parse1 = JSON.parse(realArray[0][2]);
                if (parse1?.[4]?.[0]?.[1] && typeof parse1[4][0][1][0] === 'string') {
                    session.resumeArray = [...parse1[1], parse1[4][0][0]];
                    return parse1[4][0][1][0].replace(/\*\*(.+?)\*\*/g, `*$1*`);
                }
            } catch (_) {}
        }

        throw new Error("Could not parse Gemini's response. The API structure may have changed.");
    }
};

// ── CLI ──────────────────────────────────────────────────────────────────────

const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}You:${RESET} `
});

const session = { cookie: null, resumeArray: null };

console.log(`\n${CYAN}╔══════════════════════════════════╗`);
console.log(`║       Gemini CLI Chat  🤖        ║`);
console.log(`╚══════════════════════════════════╝${RESET}`);
console.log(`${DIM}Type your message and press Enter.`);
console.log(`Commands: /reset  /exit${RESET}\n`);

rl.prompt();

rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // Commands
    if (input === '/exit' || input === '/quit') {
        console.log(`\n${DIM}Goodbye!${RESET}\n`);
        process.exit(0);
    }

    if (input === '/reset') {
        session.cookie = null;
        session.resumeArray = null;
        console.log(`${YELLOW}🔄 Conversation reset.${RESET}\n`);
        rl.prompt();
        return;
    }

    // Pause input while waiting for response
    rl.pause();
    process.stdout.write(`${DIM}Gemini: thinking...${RESET}`);

    try {
        const reply = await gemini.ask(input, session);
        // Clear "thinking..." line
        process.stdout.write('\r\x1b[K');
        console.log(`${CYAN}Gemini:${RESET} ${reply}\n`);
    } catch (e) {
        process.stdout.write('\r\x1b[K');
        console.error(`${RED}Error:${RESET} ${e.message}\n`);
    }

    rl.resume();
    rl.prompt();
});

rl.on('close', () => {
    console.log(`\n${DIM}Session ended.${RESET}\n`);
    process.exit(0);
});
