const express = require('express');
const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const mime = require('mime-types');
const path = require('path');
const fetch = require('node-fetch'); // For making HTTP requests
const mongoose = require('mongoose');
const https = require('https');
const cors = require('cors');
require('dotenv').config()
mongoose.connect(process.env.MONGODB, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const app = express();
const PORT = 8443;
app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal'])
app.use(cors());

const B2_BUCKET_URL = 'https://f001.backblazeb2.com/file/YOUR_BUCKET_NAME/'; // Replace with your B2 bucket URL



const BannedHash = mongoose.model('BannedHash', new mongoose.Schema({
    hash: String,
}));

const fileSchema = new mongoose.Schema({
    originalName: String,
    encryptedFileName: String,
    extension: String,
    encryptionKey: String,
    iv: String,
    fileHash: String,
});

const File = mongoose.model('File', fileSchema);

function decryptAndDecompress(data, encryptionKey, iv) {
    try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(encryptionKey, 'hex'), Buffer.from(iv, 'hex'));
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        const decompressed = zlib.gunzipSync(decrypted);
        return decompressed;
    } catch (error) {
        console.error('Error during decryption and decompression:', error);
        throw new Error('Error decrypting and decompressing data');
    }
}

app.get('/:fileId', async (req, res) => {
    const fileId = req.params.fileId.trim();

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(fileId)) {
        return res.status(400).send('Invalid file ID format');
    }

    try {
        // Look up the file in the database using the validated ObjectId
        const file = await File.findById(fileId);

        if (!file) {
            return res.status(404).send('File not found');
        }

        // Construct the URL to the file in the Backblaze B2 bucket
        const fileUrl = B2_BUCKET_URL + file.encryptedFileName;

        // Determine the MIME type from the original file extension
        const mimeType = mime.lookup(file.extension);

        // Check if the MIME type is of an image or video
        if (mimeType && (mimeType.startsWith('image/') || mimeType.startsWith('video/'))) {
            // Set the Content-Type for the response
            res.setHeader('Content-Type', mimeType);

            // Fetch the file from the B2 bucket and stream it to the client
            const response = await fetch(fileUrl);
            if (!response.ok) {
                console.error('Error fetching file from Backblaze B2:', response.statusText);
                return res.status(500).send('Error fetching file');
            }
            response.body.pipe(res);
        } else {
            res.status(400).send('Requested file is not an image or video');
        }
    } catch (error) {
        console.error('Error retrieving file:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
