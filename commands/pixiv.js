const axios = require('axios');
const fs = require('fs');

        
async function searchImage(title, mode, page) {
    try {
        const response = await axios.get(`https://www.pixiv.net/ajax/search/artworks/${title}?word=${title}&mode=${mode}&p=${page}`, {
            headers: {
                'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 Mozilla/5.0 (X11; Linux x86_64; rv:10.0)',
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

async function getPage(title, mode) {
    try {
        const response = await axios.get(`https://www.pixiv.net/ajax/search/artworks/${title}?word=${title}&mode=${mode}`, {
            headers: {
                'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 Mozilla/5.0 (X11; Linux x86_64; rv:10.0)',
                'Referer' : 'https://www.pixiv.net/',
                'Accept-Encoding' : 'gzip,deflate,br,zstd',
                'Cookie': process.env.PIXIV_SESSID
            },
        });

        const page = response.data.body.illustManga.lastPage;
        if (!page || page === 0) {
            return null;
        }
        return page;
    } catch (e) {
        console.log("Error : ", e);
    }
}

async function getImageLink(id) {
    const response = await axios({
        url: `https://www.pixiv.net/ajax/illust/${id}`,
        method: 'get',
        headers: {
            'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 Mozilla/5.0 (X11; Linux x86_64; rv:10.0)',
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
                'User-Agent' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36 Mozilla/5.0 (X11; Linux x86_64; rv:10.0)',
                'Referer' : `https://www.pixiv.net/member_illust.php?mode=medium&illust_id=${id}`,
                'Accept-Encoding' : 'gzip,deflate,br,zstd',
                'Cookie' : process.env.PIXIV_SESSID
            }
        });
        console.log(`Content Length : ${response.headers["content-length"]}`);
        let downloadedSize = 0;
        const totalSize = parseInt(response.headers["content-length"]);
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

module.exports = {downloadImage, getImageLink, searchImage, getPage}