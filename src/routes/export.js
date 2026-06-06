const express = require('express');
const fs      = require('fs').promises;
const path    = require('path');
const router  = express.Router();

const folderPicker = require('../services/folderPicker');

// Shared multi-file save: opens folder picker once and writes all requested files.
// Body: { files: [{filename, markdown?, pdf?}], formats: {md, pdf} }
router.post('/save-files', async (req, res) => {
  try {
    const { files, formats } = req.body;
    if (!Array.isArray(files) || !files.length) {
      return res.status(400).json({ error: 'No files provided' });
    }
    if (!formats || (!formats.md && !formats.pdf)) {
      return res.status(400).json({ error: 'At least one format must be selected' });
    }

    const folder = await folderPicker.pick();
    if (!folder) return res.json({ cancelled: true });

    const savedFiles = [];
    for (const { filename, markdown, pdf } of files) {
      if (formats.md && markdown) {
        await fs.writeFile(path.join(folder, `${filename}.md`), markdown, 'utf8');
        savedFiles.push(`${filename}.md`);
      }
      if (formats.pdf && pdf) {
        await fs.writeFile(path.join(folder, `${filename}.pdf`), Buffer.from(pdf, 'base64'));
        savedFiles.push(`${filename}.pdf`);
      }
    }

    res.json({ success: true, path: folder, savedFiles, count: savedFiles.length });
  } catch (err) {
    console.error('Export save-files error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
