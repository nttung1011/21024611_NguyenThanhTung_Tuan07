const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const path = require('path');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
dotenv.config();
const app = express();
const port = 2000;
const CLOUD_FRONT_URL = 'https://d1han884xvxa8w.cloudfront.net';
app.use(express.urlencoded({ extended: true }));
app.use(express.static('./views'));
app.set('view engine', 'ejs');
app.set('views', './views');

const config = new AWS.Config({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});
AWS.config = config;

const s3 = new AWS.S3();
const docClient = new AWS.DynamoDB.DocumentClient();
const tableName = 'SanPham';

const storage = multer.memoryStorage();

function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);
    if (extname && mimetype) {
        return cb(null, true);
    }
    return cb("Error: Image Only");
}

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    },
});


app.get('/', (req, res) => {
    const params = {
        TableName: tableName,
    };

    docClient.scan(params, (err, data) => {
        if (err) {
            console.error("LỖI LẤY DỮ LIỆU:", err);
            return res.send('Internal Server Error');
        }
        res.render('index', { sanPhams: data.Items });
    });
});


app.post('/add', upload.single('image'), (req, res) => {
    const { ma_sp, ten_sp, so_luong } = req.body;
    let image_url = '';

    if (req.file) {
        const image = req.file.originalname.split(".");
        const fileType = image[image.length - 1];
        const filePath = `${uuidv4()}-${Date.now().toString()}.${fileType}`;

        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
        };

        s3.upload(params, (error, data) => {
            if (error) {
                console.log('error = ', error);
                return res.send('Internal Server Error');
            } else {
                const newItem = {
                    TableName: tableName,
                    Item: {
                        "ma_sp": Number(ma_sp),
                        "ten_sp": ten_sp,
                        "so_luong": Number(so_luong),
                        "image_url": `${CLOUD_FRONT_URL}${filePath}`
                    }
                };

                docClient.put(newItem, (err, data) => {
                    if (err) {
                        console.log('error = ', err);
                        return res.send('Internal Server Error');
                    } else {
                        return res.redirect("/");
                    }
                });
            }
        });
    } else {
        const newItem = {
            TableName: tableName,
            Item: {
                "ma_sp": Number(ma_sp),
                "ten_sp": ten_sp,
                "so_luong": Number(so_luong),
                "image_url": ""
            }
        };

        docClient.put(newItem, (err, data) => {
            if (err) {
                console.log('error = ', err);
                return res.send('Internal Server Error');
            } else {
                return res.redirect("/");
            }
        });
    }
});

app.post('/delete', upload.none(), (req, res) => {
    let { ma_sp } = req.body;

    if (!ma_sp) return res.redirect('/');
    if (!Array.isArray(ma_sp)) ma_sp = [ma_sp];

    function deleteNext(index) {
        if (index >= ma_sp.length) return res.redirect('/');

        const params = {
            TableName: tableName,
            Key: { ma_sp: Number(ma_sp[index]) },
        };

        docClient.delete(params, (err) => {
            if (err) {
                console.error("LỖI XOÁ:", err);
                return res.send('Xoá thất bại');
            }
            deleteNext(index + 1);
        });
    }

    deleteNext(0);
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});