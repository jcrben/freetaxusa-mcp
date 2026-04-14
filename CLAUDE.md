# FreeTaxUSA MCP Server

Browser automation MCP for FreeTaxUSA tax filing using Playwright.

## Architecture

- **Transport**: stdio
- **Browser**: Playwright persistent Chromium context at `~/.freetaxusa-mcp/browser-profile/`
- **Navigation**: SID-based URL parameters (`?sid=N`), dynamically discovered from nav sidebar
- **Form interaction**: Accessibility tree targeting (not CSS selectors)
- **Security**: PII filter on all outputs (SSN masking, account number masking)
- **Concurrency**: Async mutex prevents concurrent page operations

## Commands

```bash
npm run build    # TypeScript compile
npm run start    # Run server (stdio)
npm run dev      # Run with tsx (development)
npm test         # Run unit tests
```

## Tool Categories

### Phase 1 (Implemented)
- `authenticate` - Login with email/password
- `get_session_status` - Check session state
- `read_current_page` - Read form fields on current page
- `save_and_continue` - Submit current page
- `navigate_section` - Jump to section by name or SID
- `fill_taxpayer_info` - Fill personal info
- `fill_filing_status` - Set filing status
- `get_tax_summary` - Return overview
- `get_refund_estimate` - Refund/owed amount

### Phase 2 (Stubbed)
- `fill_w2_income`, `fill_1099_income`

### Phase 3 (Stubbed)
- `fill_deductions`, `review_return`, `file_extension`, `get_form_status`

## Security

- Credentials never stored to disk
- PII filtered from all tool outputs
- Browser profile chmod 0700
- Anti-bot flags on browser launch
- Session expiry detected on every tool call
- State filing paywall detection
