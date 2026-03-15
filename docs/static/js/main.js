// Platform detection — highlight the user's OS download button
(function () {
  var ua = navigator.userAgent;
  var os = 'linux';
  if (ua.indexOf('Mac') !== -1) {
    // Default to Apple Silicon; Intel users can pick the other button
    os = 'mac-arm';
  } else if (ua.indexOf('Win') !== -1) {
    os = 'win';
  }

  // Highlight the matching download button
  var buttons = document.querySelectorAll('.btn-download[data-os]');
  buttons.forEach(function (btn) {
    if (btn.getAttribute('data-os') === os) {
      btn.classList.add('highlighted');
    }
  });

  // Update hero CTA to link directly to the detected OS download
  var heroBtn = document.getElementById('hero-download-btn');
  if (heroBtn) {
    var match = document.querySelector('.btn-download[data-os="' + os + '"]');
    if (match) {
      heroBtn.setAttribute('href', match.getAttribute('href'));
      var osName = {
        'mac-arm': 'macOS (Apple Silicon)',
        'mac-intel': 'macOS (Intel)',
        win: 'Windows',
        linux: 'Linux',
      };
      heroBtn.querySelector('span').textContent = 'Download for ' + osName[os];
    }
  }
})();
