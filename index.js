// import makeWASocket, {useMultiFileAuthState } from "baileys";
const { makeWASocket, useMultiFileAuthState, Browsers, getContentType, downloadContentFromMessage } = require('baileys');
const {Boom} = require('@hapi/boom');
const NodeCache = require('node-cache');
const readline = require('readline');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');


const env = process.env


async function connectToWhatsapp() {
    const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
    const { state, saveCreds } = await useMultiFileAuthState('auth_file_baileys');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        cachedGroupMetadata: async (id) => await groupCache.get(id),
    });
    
    if (!sock.authState.creds.registered) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        const question = (text) => new Promise((resolve) => rl.question(text, resolve));
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
                connectToWhatsapp();
            } else {
                console.log('Logout :(');
            }
        } else if (connection === 'open') {
            console.log('Connected :)');
        }
    })


    let isSelf = false;
    sock.ev.on('messages.upsert', async (event) => {
        for (const message of event.messages) {
            const prefix = 'bot!';
            const content = message.message.conversation.toString() || message.message.extendedTextMessage.text.toString();
            const args = parseArguments(content);
            const command = content.slice(prefix.length).trim().split(/ +/).shift().toLowerCase();
            const groupID = message.key.remoteJid;
            const userName = message.pushName || message.key.participant;
            
            console.log(`Message From : ${userName}\nMessage Sent In : ${groupID}\nMessage Content : ${content}\nCommand Used : ${command}\nArgs Used : ${JSON.stringify(args, undefined, 2)}\n\n`);

            if (content.toLowerCase().startsWith(prefix)) {
                
                if (!isSelf) {
                    if (command == "ping") {
                        sock.sendMessage(groupID, { text: "Bot telah on!" });
                        sock.groupParticipantsUpdate("", 'remove')
                    }
                }
                
                if (command == "self") {
                    if (isSelf) {
                        isSelf = false;
                        sock.sendMessage(groupID, { text: "Bot kembali aktif!" });
                    } else {
                        isSelf = true;
                        sock.sendMessage(groupID, { text: "Bot telah di self, tidak akan merespon command" });
                    }
                }
            }
        }
    });

    

}


function saveLeaderboard(data) {
    fs.writeFileSync(`./jsonData/leaderboard.json`, JSON.stringify(data, null, 2), 'utf-8');
}

function readLeaderboardData() {
    if (fs.existsSync('./jsonData/leaderboard.json')) {
        try {
            const data = JSON.parse(fs.readFileSync('./jsonData/leaderboard.json', 'utf8'));
            // Validasi apakah data berupa array
            if (Array.isArray(data)) {
                return data;
            } else {
                console.log('Invalid JSON structure. Resetting to empty array.');
                return [];
            }
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return [];
        }
    }
    console.log('File not found. Returning empty array.');
    return [];
}

function updateLeaderboard(groupId, userId, point) {
    let leaderboard = readLeaderboardData();

    let groupData = leaderboard.find((item) => item.groupId === groupId)
    if (!groupData) {
        groupData = {groupId, data: {}};
        leaderboard.push(groupData);
    }
    groupData.data[userId] = (groupData.data[userId] || 0) + point
    
    saveLeaderboard(leaderboard)
}

function parseArguments(input) {
    const args = {}
    const regex = /-([a-zA-Z]+)\s+"([^"]+)"|-([a-zA-Z]+)\s+(\S+)/g;
    let match;

    while ((match = regex.exec(input)) !== null) {
        if (match[1]) {
            args[match[1]] = match[2];
        } else if (match[3]) {
            args[match[3]] = match[4];
        }
    }
    return args;
}

connectToWhatsapp();