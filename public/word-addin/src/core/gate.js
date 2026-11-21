/**
 * New tools are admin-only at first (owner decision 2026-11-20). The server is the
 * real gate (role check on /ext/ai/runs); this only hides the buttons so a normal
 * lawyer never sees a feature that will refuse them.
 */
                                                                                        
export function wordToolsVisible(s                              )          {
  return !!s && (s.is_admin === true || s.flags?.word_tools_open === true);
}
