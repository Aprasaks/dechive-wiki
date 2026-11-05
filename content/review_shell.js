// Static offline review UI: no network requests, credentials or persisted accounts.
(() => {
  const dialog = document.getElementById('review-panel');
  const title = document.getElementById('panel-title');
  const message = document.getElementById('panel-message');
  const search = document.getElementById('review-search');
  const input = document.getElementById('review-query');
  const results = document.getElementById('review-results');
  const catalog = [
    { title: 'Pompeii', text: 'History, Vesuvius, Roman life, archaeology and ancient DNA', href: 'pompeii.en.html' },
    { title: 'History', text: 'Domain review and unpublished editorial candidates', href: 'domain-history.html' }
  ];
  function find() {
    results.replaceChildren();
    const term = input.value.trim().toLowerCase();
    if (!term) { results.textContent = 'Type a topic to search the two pages in this review.'; return; }
    const matches = catalog.filter(x => (x.title + ' ' + x.text).toLowerCase().includes(term));
    if (!matches.length) { results.textContent = 'No matching pages in this review bundle.'; return; }
    for (const item of matches) {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.title + ' — ' + item.text;
      results.append(link);
    }
  }
  input.addEventListener('input', find);
  document.getElementById('close-panel').addEventListener('click', () => dialog.close());
  document.querySelectorAll('[data-review-panel]').forEach(button => {
    button.addEventListener('click', () => {
      const panel = button.dataset.reviewPanel;
      search.hidden = panel !== 'search';
      title.textContent = panel === 'search' ? 'Search' : panel === 'share' ? 'Share article' : panel === 'saved' ? 'Saved knowledge' : panel === 'notifications' ? 'Notifications' : panel === 'collection' ? button.dataset.label : 'Sign in';
      message.textContent = panel === 'search' ? 'Search is limited to this offline bundle; it is not the live archive search.' : panel === 'share' ? 'This article is unpublished and has no public URL. Public link sharing will be connected after publication.' : panel === 'collection' ? 'This collection is not available in the review bundle yet.' : panel === 'notifications' ? 'Notifications are not connected in this preview.' : panel === 'saved' ? 'Account bookmarks require a connected reader account. This offline preview does not store your reading list. Use Sign in on the live site when reader accounts are available.' : 'Reader sign-in is not connected to this offline preview. No password is requested or stored here. The private site preview password is separate from a future reader account.';
      dialog.showModal();
      if (panel === 'search') { input.value = ''; find(); input.focus(); }
    });
  });
})();
