# Cart Persistence Test Cases

## Frontend + Backend

1. Guest adds one item, refreshes, and sees the same cart.
2. Guest adds mixed variant configurations of the same dish and sees separate lines.
3. Guest adds identical variant configuration twice and quantity combines into one line.
4. Guest adds cart items, logs in, and sees the same cart after merge.
5. Guest adds cart items, logs in, refreshes, and still sees the merged authenticated cart.
6. Guest adds cart items, logs in twice quickly, and the merge only happens once.
7. Guest cart and authenticated cart contain the same exact line; merge combines quantities.
8. Guest cart and authenticated cart contain the same menu item with different variant ids; merge keeps separate lines.
9. Guest cart and authenticated cart contain different add-on sets or customizations; merge keeps separate lines.
10. Guest cart contains a different restaurant than the authenticated backend cart; merge skips guest items and keeps the authenticated cart unchanged.
11. User A logs in, adds items, logs out, and sees a fresh empty guest cart.
12. User A logs out, User B logs in on the same device, and User A cart never appears.
13. User A logs out, continues as guest, adds new items, and only that fresh guest cart exists locally.
14. Same user logs back in later and only that same user backend cart is restored.
15. Stored guest cart has a stale zone id that no longer matches the active zone; guest cart is cleared safely.
16. Expired or invalid auth token on startup does not hydrate another user's cached cart.
17. App startup with authenticated user does not flash a previous user's cart before validation finishes.
18. Successful order placement clears the current cart and the backend cart state on next sync.
19. Logout removes user-bound cart cache keys and rotates to a new guest session id.
20. Merge preserves selected variation, selected add-ons, customizations, special instructions, and pricing snapshot fields.
