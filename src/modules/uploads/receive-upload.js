'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { finished, pipeline } = require('node:stream/promises');
const { BadRequestException, PayloadTooLargeException } = require('@nestjs/common');

const ALLOWED_EXTENSIONS = Object.freeze(['.csv', '.xlsx']);

// Streams the multipart "file" part (@fastify/multipart) to a temp file and returns its path.
// Validates by extension, not MIME type: browsers and Postman on Windows send CSV as
// application/vnd.ms-excel.
async function receiveUpload(req, { fieldName = 'file', maxBytes }) {
  if (typeof req.isMultipart !== 'function' || !req.isMultipart()) {
    throw new BadRequestException(`Send multipart/form-data with the file in a "${fieldName}" field`);
  }

  const part = await req.file();
  if (!part) throw new BadRequestException(`Attach a .csv or .xlsx file in the "${fieldName}" field`);

  // Read the rest of the upload before answering; replying mid-upload resets the client's connection.
  const refuse = async (exception) => {
    await finished(part.file.resume()).catch(() => {});
    throw exception;
  };
  if (part.fieldname !== fieldName) await refuse(new BadRequestException(`Expected the file in the "${fieldName}" field`));
  const ext = path.extname(part.filename ?? '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) await refuse(new BadRequestException('Only .csv and .xlsx files are accepted'));

  const tempPath = path.join(os.tmpdir(), `customer-api-upload-${randomUUID()}${ext}`);
  try {
    await pipeline(part.file, fs.createWriteStream(tempPath));
    if (part.file.truncated) throw Object.assign(new Error('truncated'), { code: 'FST_REQ_FILE_TOO_LARGE' });
  } catch (err) {
    await fs.promises.unlink(tempPath).catch(() => {});
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') throw new PayloadTooLargeException(`File is larger than ${maxBytes} bytes`);
    throw err;
  }

  return { path: tempPath, originalName: part.filename, ext };
}

module.exports = { receiveUpload, ALLOWED_EXTENSIONS };
