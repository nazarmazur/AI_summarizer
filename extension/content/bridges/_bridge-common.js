// Shared helpers for the browser-session bridges. Each provider script
// imports nothing — instead this file is concatenated above the provider
// script by listing it first in manifest content_scripts. (But here we
// duplicate the helpers inline to keep each bridge self-contained.)
//
// NOTE: We don't actually import this — each bridge inlines its helpers.
//       This file is kept as a single source of truth / reference.
