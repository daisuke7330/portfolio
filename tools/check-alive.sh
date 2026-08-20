#!/usr/bin/env bash
# 提案文に貼っているURLがすべて生きているか確認する
#
# 特に nexus-am.rf.gd は無料ホスティング（InfinityFree）なので、
# 停止・広告挿入・証明書切れが起きうる。応募文を送る前に叩く。
#
# 使い方： bash tools/check-alive.sh

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

URLS=(
  "https://kuroda-daisuke-portfolio.vercel.app/"
  "https://reine-clinic.vercel.app/"
  "https://patisserie-yui.vercel.app/"
  "https://nexus-hp.vercel.app/index.html"
  "https://nexus-am.rf.gd/"
  "https://nexus-am.rf.gd/services/am/"
  "https://cafe-samples-rim3envzr-daisuke-s-projects2.vercel.app/"
  "https://cafe-samples-rim3envzr-daisuke-s-projects2.vercel.app/samples/C/index.html"
)

ng=0
for u in "${URLS[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 25 -A "$UA" "$u")
  if [ "$code" = "200" ]; then
    printf '  ○ %-52s %s\n' "$u" "$code"
  else
    printf '  ★ %-52s %s ← 要確認\n' "$u" "$code"
    ng=$((ng+1))
  fi
done

# rf.gd の証明書の残り日数
END=$(echo | openssl s_client -servername nexus-am.rf.gd -connect nexus-am.rf.gd:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$END" ]; then
  DAYS=$(node -e "console.log(Math.round((new Date('$END')-new Date())/86400000))")
  if [ "$DAYS" -lt 14 ]; then
    echo "  ★ nexus-am.rf.gd の証明書が残り ${DAYS} 日です（切れると保護されていない通信の警告が出ます）"
    ng=$((ng+1))
  else
    echo "  ○ nexus-am.rf.gd の証明書は残り ${DAYS} 日"
  fi
fi

echo ""
if [ "$ng" -eq 0 ]; then echo "  すべて正常です。URLを貼って大丈夫です"; else echo "  ★ ${ng} 件に問題があります。提案文を送る前に対処してください"; fi
exit $ng
