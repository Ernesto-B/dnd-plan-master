const { exec } = require('child_process');

function isElectronRuntime() {
  return !!(process.versions && process.versions.electron);
}

async function pickElectronFolder() {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    title: 'Choose where to save your D&D session files',
    properties: ['openDirectory', 'createDirectory'],
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  return result.filePaths[0];
}

function pick() {
  if (isElectronRuntime()) {
    return pickElectronFolder();
  }

  return new Promise((resolve) => {
    let cmd;

    if (process.platform === 'darwin') {
      cmd = `osascript -e 'POSIX path of (choose folder with prompt "Choose where to save your D&D session files:")'`;
    } else if (process.platform === 'win32') {
      cmd = [
        'powershell -NoProfile -NonInteractive -Command',
        '"Add-Type -AssemblyName System.Windows.Forms;',
        '$d = New-Object System.Windows.Forms.FolderBrowserDialog;',
        '$d.Description = \'Choose where to save your session files\';',
        'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK)',
        '{ $d.SelectedPath } else { \'\' }"',
      ].join(' ');
    } else {
      // Linux — requires zenity
      cmd = `zenity --file-selection --directory --title="Choose where to save your session files"`;
    }

    exec(cmd, { timeout: 120_000 }, (_err, stdout) => {
      const folder = stdout ? stdout.trim() : null;
      resolve(folder || null);
    });
  });
}

module.exports = { pick };
