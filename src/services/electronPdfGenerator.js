const { BrowserWindow } = require('electron');

const PDF_OPTIONS = {
  pageSize: 'Letter',
  margins: {
    top: 0.45,
    bottom: 0.45,
    left: 0.45,
    right: 0.45,
  },
  printBackground: true,
  preferCSSPageSize: false,
};

async function generateFromHtml(html) {
  let window = null;

  try {
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: false,
      },
    });

    await window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    return await window.webContents.printToPDF(PDF_OPTIONS);
  } finally {
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
  }
}

module.exports = { generateFromHtml };
