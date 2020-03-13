/* eslint-disable no-console */
const archiver = require('archiver');
const fs = require('fs');
const config = require('config');
const AWS = require('aws-sdk');
const { promisify } = require('util');
const zlib = require('zlib');

AWS.config.update({
  accessKeyId: config.get('awsID'),
  secretAccessKey: config.get('awsKey'),
});

const date = new Date();
const prefix = `${date.getFullYear()}${date.getDate()}${date.getHours()}${date.getMinutes()}${date.getSeconds()}`;

function removeLocal() {
  const exists = fs.existsSync(`${prefix}.zip`);
  if (exists) {
    console.log('Deleting failed zip');
    fs.unlinkSync(`${prefix}.zip`);
  }
}

async function uploadToS3(file, bucket) {
  try {
    console.log('Uploading to S3...');
    const upload = promisify(bucket.upload).bind(bucket);
    const params = {
      Bucket: config.get('bucket'),
      Body: file,
      Key: prefix,
    };
    await upload(params);
  } catch (error) {
    console.error(error);
    removeLocal();
    process.exit(0);
  }
}


async function run() {
  const bucket = new AWS.S3();
  const directories = config.get('directories');
  const out = fs.createWriteStream(`${prefix}.zip`);
  const archive = archiver('zip', {
    zlib: { level: 9 },
  });

  console.log('Starting Daemon');
  out.on('finish', async () => {
    try {
      console.log(`${archive.pointer()} total bytes written`);
      console.log('Finished Writing Data and Backing up');
      const file = fs.createReadStream(`${prefix}.zip`).pipe(zlib.createGzip());
      await uploadToS3(file, bucket);
      removeLocal();
      console.log('Done');
    } catch (error) {
      console.error(error);
      removeLocal();
      process.exit(0);
    }
  });

  out.on('error', (err) => {
    console.log(`Error while writing Data: ${err}`);
  });

  archive.on('warning', (err) => {
    switch (err.code) {
      case 'ENOENT':
        console.log(err);
        break;
      case 'ENTRYNOTSUPPORTED':
        console.log('Invalid Entry, continuing...');
        break;
      default:
        removeLocal();
        throw err;
    }
  });

  archive.on('error', (err) => {
    throw err;
  });


  directories.forEach((dir) => archive.directory(dir, dir));

  archive
    .pipe(out);

  archive.finalize();
}

process.on('SIGINT', () => {
  removeLocal();
  process.exit(0);
});

process.on('SIGTERM', () => {
  removeLocal();
  process.exit(0);
});

run().catch(console.err);
