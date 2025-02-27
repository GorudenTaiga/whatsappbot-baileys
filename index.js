// import makeWASocket, {useMultiFileAuthState } from "baileys";
const { makeWASocket, useMultiFileAuthState, Browsers, getContentType, downloadContentFromMessage, } = require('baileys');
const {Boom} = require('@hapi/boom');
const NodeCache = require('node-cache');
const readline = require('readline');
const axios = require('axios');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');
require('dotenv').config();
const { downloadImage, getImageLink, searchImage, getPage } = require('./commands/pixiv');
const path = require('path');
const { WebSocketClient } = require('baileys/lib/Socket/Client');
const { stringify } = require('querystring');
const express = require('express');
const app = express();

app.get("/", (req, res) => {
    res.send("Bot is running!");
});

app.listen(3000, () => {
    console.log("Server is running on port 3000");
    connectToWhatsapp();
});



async function connectToWhatsapp() {
    const groupCache = new NodeCache({ stdTTL: 10 * 60, useClones: false });
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
        const jsonData = JSON.parse(readJsonData('./jsonData/intro.json'));
        
        if (event.action == 'add') {
            
        }
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
            try {
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
                            return;
                        } else if (command == "button") {
                            // Buttons has deprecated from baileys
                            //
                            // sock.sendMessage(groupID, {
                            //     buttonsMessage: {
                            //         footerText: `Jika Tidak Bisa Tekan Tombol, Ketik ick @Tag Orang --force`,
                            //         contentText:
                            //             "*WARNING* | Yang Di Kick Adalah Admin Apakah Anda Yakin?",
                            //         buttons: [
                            //             {
                            //             buttonId: `ping`,
                            //             buttonText: {
                            //                 displayText: "Ya",
                            //             },
                            //             type: 1,
                            //             },
                            //         ],
                            //         headerType: "EMPTY",
                            //     }},
                            //     {
                            //         contextInfo: {
                            //         mentionedJid: [a],
                            //         },
                            //     }
                            // )
                            // console.log(JSON.stringify(message, undefined, 2));
                            //
                        } else if (command == "pixiv") {
                            setImmediate(async () => {
                                args.count = args.count ? args.count : 1;
                                args.title = args.title ? args.title : "default";
                                args.mode = args.mode ? args.mode : "safe";
                                const paths = []
                                
                                const status = await sock.sendMessage(groupID, { text: "Gambar sedang di download... (Perkiraan 1x gambar = 10-20 detik)\n*Jika lebih dari perkiraan namun belum mendapatkan gambar, maka hubungi owner" }, { quoted: message });
                                try {
                                    for (let i = 1; i <= parseInt(args.count); i++) {
                                        const pageRaw = await getPage(args.title, args.mode);
                                        const page = Math.floor(Math.random() * (parseInt(pageRaw) - 1 + 1)) + 1;
                                        console.log("Page : ", page);
                                        const image = await searchImage(args.title, args.mode, page);
                                        const imageIndex = Math.floor(Math.random() * (image.length - 0 + 1)) + 0;
                                        console.log("Image index : ", imageIndex);
                                        const randomImage = image[imageIndex];
                                        if (image && image.length > 0) {
                                            const imagePath = `${__dirname}/imageTemp/input/${randomImage.id}.jpg`;
                                            const originalUrl = await getImageLink(randomImage.id);
                                            console.log("Image ID : ", randomImage.id);
                                            
                                            await downloadImage(groupID, originalUrl, imagePath, randomImage.id, sock, status.key).then(async () => {
                                                paths.push({url: imagePath});
                                                sock.sendMessage(groupID, { text: `Gambar sedang di download... [${paths.length}/${args.count}]\n\n*Jika lebih dari 3 menit namun belum terdapat peningkatan progress, maka harap report dengan cara japri ke nomor bot ini dengan menggunakan command\nbot!report -e "Download lama"`, edit: status.key });
                                            }).catch(async (e) => {
                                                sock.sendMessage(groupID, { text: `Salah satu gambar gagal didownload, harap lakukan DM/Japri melalui nomor ini dengan mengirimkan command sebagai berikut :`}, {quoted: message});
                                                sock.sendMessage(groupID, {text: `bot!report -e "${e.message}"`})
                                            });
                                            
                                        }
                                    }
                                    for (const image of paths) {
                                        const sendImage = await sock.sendMessage(groupID, {
                                            image: image
                                        });
                                        
                                        if (sendImage) {
                                            fs.unlink(image.url.toString(), (err) => {
                                                console.log("Error : ", err);
                                            });
                                        }
                                    }
                                    sock.sendMessage(groupID, { text: `Berikut adalah gambar untuk tag ${args.title}\nJudul : ${args.title}\nMode : ${args.mode}` }, { quoted: message });
                                } catch (e) {
                                    console.log("Tidak dapat mengirim gambar : ", e);
                                    sock.sendMessage(groupID, { text: `Gambar gagal di download, harap lakukan DM/Japri melalui nomor ini dengan mengirimkan command sebagai berikut :`, edit: status.key, mentions: message.key.participant });
                                    sock.sendMessage(groupID, {text: `bot!report -e "${e.message}"`})
                                }
                            });
                        } else if (command == "setintro") {
                            await sock.sendPresenceUpdate('available', groupID);
                            if (groupID.includes('@g.us')) {
                                if (!args.intro) {
                                    sock.sendMessage(groupID, { text: 'Harap gunakan parameter `-intro "text intro"`\n*Jangan lupa tanda petik (" ")' });
                                    return;
                                }
                                try {
                                    let data = await JSON.parse(readJsonData('./jsonData/intro.json'));
                                    console.log(`JSON Data Intro :\n${data.toString()}`);
                                    if (data.find((item) => item.groupId === groupID)) {
                                        data[0].intro = args.intro;
                                        try {
                                            fs.writeFileSync('./jsonData/intro.json', JSON.stringify(data, null, 2), 'utf-8');
                                            sock.sendMessage(groupID, { text: "Berhasil mengupdate intro" }, { quoted: message });
                                            return;
                                        } catch (e) {
                                            console.log("Error : ", e)
                                            sock.sendMessage(groupID, { text: "Gagal mengupdate intro" }, { quoted: message });
                                            return;
                                        }
                                    } else {
                                        sock.sendMessage(groupID, { text: "Data grup tidak ditemukan, segera dibuatkan intro" }, {quoted: message});
                                        const inputData = {
                                            groupId: groupID,
                                            createdBy: message.key.participant,
                                            intro: args.intro
                                        }
                                        try {
                                            data.push(inputData)
                                            fs.writeFileSync('./jsonData/intro.json', JSON.stringify(data, null, 2), 'utf-8')
                                            sock.sendMessage(groupID, { text: "Intro sudah berhasil ditambah" }, { quoted: message });
                                            return;
                                        } catch (e) {
                                            console.log("Error : ", e)
                                            sock.sendMessage(groupID, { text: "Data gagal disimpan" }, { quoted: message });
                                            return;
                                        }
                                    }
                                } catch (e) {
                                    console.log("Error : ", e)
                                }
                            } else {
                                sock.sendMessage(groupID, { text: "Anda sedang tidak berada di grup" }, { quoted: message });
                            }
                        } else if (command == "report" && message.key.remoteJid.includes('@s.whatsapp.net') && args.e) {
                            sock.sendMessage('6287743160171@s.whatsapp.net', { text: `Terdapat error pada saat penggunaan bot dengan rincian berikut :\nReporter : ${message.key.remoteJid} | ${userName}\nError Code: ${args.e}` });
                            sock.sendMessage(groupID, { text: "Terima kasih telah report error ini, owner sedang mencoba untuk memperbaiki" }, {quoted: message});
                        } 
                    } else {
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
            } catch (e) {
                console.log("")
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
    let data = fs.readFileSync(path, 'utf-8');
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