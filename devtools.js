// Create console panel
chrome.devtools.panels.create(
  'Reader',
  'icon16.png',
  'console-panel/panel.html',
  (panel) => {
    console.log('Console Reader panel created');
  }
);
