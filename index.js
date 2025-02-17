// import makeWASocket, {useMultiFileAuthState } from "baileys";
const { makeWASocket, useMultiFileAuthState, Browsers, getContentType, downloadContentFromMessage } = require('baileys');
const {Boom} = require('@hapi/boom');
const NodeCache = require('node-cache');
const readline = require('readline');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');
const {downloadImage, getImageLink, searchImage}  = require('./commands/pixiv');


async function connectToWhatsapp() {
    const groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
    const { state, saveCreds } = await useMultiFileAuthState('auth_file_baileys');
    const sock = makeWASocket({
        auth: state,
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 0,
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
        console.log(`Perubahan pada grup ${event.participants[0]}`)
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
            const content = message.message.conversation.toString() != null ? message.message.conversation.toString() : message.message.extendedTextMessage.text.toString();
            const groupID = message.key.remoteJid;
            const userName = message.pushName || message.key.participant;
            
            
            if (content.toLowerCase().startsWith(prefix)) {
                const command = content.slice(prefix.length).trim().split(/ +/).shift().toLowerCase();
                const args = parseArguments(content);
                console.log(`Message From : ${userName}\nMessage Sent In : ${groupID}\nMessage Content : ${content}\nCommand Used : ${command}\nArgs Used : ${JSON.stringify(args, undefined, 2)}\n\n`);
                
                if (!isSelf) {
                    if (command == "ping") {
                        sock.sendMessage(groupID, { text: "Bot telah on!" });
                    } else if (command == "menu") {
                        
                    } else if (command == "setintro") {
                        await sock.sendPresenceUpdate('available', groupID);
                        if (groupID.includes('@g.us')) {
                            try {
                                let data = readJsonData('./jsonData/intro.json')
                                data = data.find((item) => item.groupId === groupID)
                                if (data) {
                                    console.log(`JSON Data Intro :\n${data}`)
                                    data.intro = args.intro;
                                    try {
                                        fs.writeFileSync('./jsonData/intro.json', JSON.stringify(data, null, 2), 'utf-8');
                                        sock.sendMessage(groupID, { text: "Berhasil mengupdate intro" }, {quoted: message});
                                    } catch (e) {
                                        console.log("Error : ", e)
                                        sock.sendMessage(groupID, { text: "Gagal mengupdate intro" }, {quoted: message});
                                    }
                                } else {
                                    sock.sendMessage(groupID, { text: "Data grup tidak ditemukan, segera dibuatkan intro" }, {quoted: message});
                                    const inputData = {
                                        groupId: groupID,
                                        createdBy: message.key.participant,
                                        intro: args.intro
                                    }
                                    data.push(inputData);
                                    try {
                                        fs.writeFileSync('./jsonData/intro.json', JSON.stringify(data, null, 2), 'utf-8')
                                        sock.sendMessage(groupID, { text: "Intro sudah berhasil ditambah" }, { quoted: message });
                                    } catch (e) {
                                        console.log("Error : ", e)
                                        sock.sendMessage(groupID, { text: "Data gagal disimpan" }, { quoted: message });
                                    }
                                }
                            } catch (e) {
                                console.log("Error : ", e)
                            }
                        } else {
                            sock.sendMessage(groupID, { text: "Anda sedang tidak berada di grup" }, { quoted: message });
                        }
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

const commandsHelp = {
    'ping': 'bot!ping : Mengetes apakah bot sudah aktif atau belum\nContoh pemakaian : bot!ping\n\n',
    'setintro': 'bot!setintro -intro <text> : Membuat sebuah pesan intro saat terdapat member baru di grup\nParameter yang dapat di isi :\n-intro : digunakan untuk menambahkan pesan intro (Jangan lupa gunakan tanda " " untuk pembuka dan penutup intro)\n-update : digunakan untuk mengupdate pesan intro yang sudah ada\nGunakan <username> untuk menambahkan mention ke orang yang baru join\n\nContoh penggunaan : bot!setintro -intro "Hello <username>, Perkenalan dulu yuk\nNama : \nGender : \nUmur : \nWaifu : \n\nSalam Kenal 😊" -update',
    'setoutro': 'bot!setoutro -outro <text> : Membuat sebuah pesan outro saat terdapat member keluar dari grup\nParameter yang dapat di isi :\n-outro : digunakan untuk menambahkan pesan outro (Jangan lupa gunakan tanda " " untuk pembuka dan penutup outro)\n-update : digunakan untuk mengupdate pesan outroyang sudah ada\nGunakan <username> untuk menambahkan mention ke orang yang baru leave\n\nContoh penggunaan : bot!setoutro -outro "Selamat tinggal <username>, semoga kamu lebih bahagia diluar sana" -update',
    'sticker': 'bot!sticker -text <text> : Konversi gambar dengan nama sesuai keinginan user\nbot!sticker : Konversi gambar menjadi sebuah sticker\nParameter yang bisa digunakan :\n-text : digunakan untuk mengisi text yang ingin digunakan sebagai nama dari stickermu\nCara pemakaian :\n1. Pilih gambar yang ingin dijadikan sticker (Diusahakan 1:1)\n2.Ketikkan command bot!sticker\n(Opsional) Jika ingin menamai sticker tersebut, maka berikan spasi setelah bot!sticker dan ketikkan nama stickermu\nContoh tanpa parameter : bot!sticker\nContoh dengan parameter : bot!sticker Ini adalah tes',
    'pixiv': 'bot!pixiv -title <title> -count <count> : Command ini ditujukan untuk mencarikan gambar sesuai keinginan pengguna\n\nParameter yang dapat di isi :\n-title : digunakan untuk mengisikan tag yang ingin kamu cari (Disarankan menggunakan bahasa jepang)\n-count : digunakan untuk mengisikan jumlah gambar yang kalian inginkan (Sementara maksimal 25)\n\nContoh pemakaian : bot!pixiv -title "丹花イブキ ロリ" -count 1',
    'help': 'Prefix : bot!\nCommands:\nping    sticker   pixiv\nsetintro    setoutro\n\nbot!help <command> : Melihat bantuan dari command yang ingin kamu gunakan\nbot!help : Melihat bantuan secara umum\nCommand ini digunakan untuk menampilkan tampilan ini'
}

function readJsonData(path) {
    let rawData = fs.readFileSync(path, 'utf-8')
    let data = JSON.parse(rawData);
    if (!data) {
        throw new Error("Tidak dapat membaca data");
    }
    return data;
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