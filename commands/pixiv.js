import axios from 'axios';
import fs from 'fs';

        
async function searchImage(title, mode) {
    try {
        console.log(process.env.PIXIV_SESSID);
        const response = await axios.get(`https://www.pixiv.net/ajax/search/artworks/${title}?word=${title}&mode=${mode}`, {
            headers: {
                'User-Agent' : 'Mozilla/5.0 (Windows NT 6.1; Win64; x64)',
                'Referer' : 'https://www.pixiv.net/',
                'Accept-Encoding' : 'gzip,deflate,br,zstd',
                'Cookie': process.env.PIXIV_SESSID
            },
        });

        const illustrations = response.data.body.illustManga.data;
        if (!illustrations || illustrations === 0) {
            return null;
        }
        return illustrations;
    } catch (e) {
        console.log("Error : ", e);
    }
}

async function getImageLink(id) {
    const response = await axios({
        url: `https://www.pixiv.net/ajax/illust/${id}`,
        method: 'get',
        headers: {
            'User-Agent' : 'Mozilla/5.0 (Windows NT 6.1; Win64; x64)',
            'Referer' : `https://www.pixiv.net/artworks/${id}`,  
            'Accept-Encoding' : 'gzip,deflate,br,zstd',
            'Cookie' : process.env.PIXIV_SESSID
        }
    });
    const data = response.data;
    const originalurl = data.body.urls.original;
    return originalurl;
}

async function downloadImage(jid, url, path, id, sock, status) {
    try {
        const response = await axios({
            url: url.replace('\\', ''),
            method: 'get',
            responseType: 'stream',
            headers: {
                'User-Agent' : 'Mozilla/5.0 (Windows NT 6.1; Win64; x64)',
                'Referer' : `https://www.pixiv.net/member_illust.php?mode=medium&illust_id=${id}`,
                'Accept-Encoding' : 'gzip,deflate,br,zstd',
                'Cookie' : process.env.PIXIV_SESSID
            }
        });
        console.log(`Content Length : ${response.headers["content-length"]}`)
        const totalSize = parseInt(response.headers["content-length"])
        let downloadedSize = 0;
        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(path);
            response.data.pipe(writer);
            response.data.on('data', (chunk) => {
                downloadedSize += parseInt(chunk.length);
            });
            
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        // fs.writeFileSync(path, Buffer.from(response.data, 'base64'));
        console.log('Gambar berhasil diunduh');
    } catch (e) {
        console.log('Gambar gagal diunduh : ', e);
    }
}

export {downloadImage, getImageLink, searchImage}