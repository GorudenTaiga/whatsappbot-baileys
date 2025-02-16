// import makeWASocket, {useMultiFileAuthState } from "baileys";
const { makeWASocket, useMultiFileAuthState, Browsers } = require('baileys');
const {Boom} = require('@hapi/boom');
const NodeCache = require('node-cache');
const readline = require('readline')


async function connectToWhatsapp() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const question = (text) => new Promise((resolve) => rl.question(text, resolve));
    const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
    const { state, saveCreds } = await useMultiFileAuthState('auth_file_baileys');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        cachedGroupMetadata: async (id) => await groupCache.get(id),
    });

    if (!sock.authState.creds.registered) {
        const number = await question("Enter number : ")
        const code = await sock.requestPairingCode(number)
        console.log(code);
    }

    sock.ev.on('group-participants.update', async (event) => {
        const metadata = await sock.groupMetadata(event.id);
        groupCache.set(event.id, metadata);
    });

    sock.ev.on('group-participants.update', async (event) => {
        const metadata = await sock.groupMetadata(event.id);
        groupCache.set(event.id, metadata);
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        if (connection === 'close'){
            if (lastDisconnect?.error?.output?.statusCode !== 401) {
                connectToWhatsapp()
            } else {
                console.log('Logout :(')
            }
        } else if (connection === 'open') {
            console.log('Connected :)')
        }
    })


    sock.ev.on('messages.upsert', async (event) => {
        for (const message of event.messages) {
            console.log(JSON.stringify(message, undefined, 2));

            console.log('replying to : ', message.key.remoteJid);
        }
    })
}

connectToWhatsapp();