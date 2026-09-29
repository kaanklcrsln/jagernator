# Search recipes

| Need | Command |
|---|---|
| Where is X defined | `rg -n "(class\|function\|def\|fn\|func\|interface\|type) X\b"` |
| Who calls X | `rg -n "\bX\(" -g '!**/*.test.*'` |
| Files touching a feature | `rg -l -i "feature-name"` |
| Config keys | `rg -n "KEY_NAME" -g '*.{json,yaml,yml,toml,env.example}'` |
| Route/handler for URL | `rg -n "['\"]/api/users"` |
| Error origin | `rg -n -F "exact error text"` |
| Recent changes to area | `git log --oneline -n 20 -- path/` then `git show <sha> -- path/file` |
| Line of last change | `git blame -L 100,140 path/file` |
| Tests for module | `rg -l "from ['\"].*module['\"]" -g '*test*'` |
| Big files to avoid | `git ls-files -z \| xargs -0 du -k 2>/dev/null \| sort -rn \| head` |

Tips: add `-g '!dist' -g '!node_modules'` when ignore files don't cover build output; `--max-count 5` limits noisy matches; `-C 3` shows context without a separate read.
