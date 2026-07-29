const fs = require('fs');
const PDFDocument = require('pdfkit');

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('/tmp/test-upload.pdf'));
doc.fontSize(25).text('John Doe\nReact Developer\nSkills: React, Node.js\nExperience: 5 years', 100, 100);
doc.end();
