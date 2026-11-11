# hece_note

내 기기 5대에서만 쓰는 개인 앱(PWA). 블로그용 스케줄표 · 가계부 · 냉장고 물품메모.

- 결정 사항과 남은 논의: [docs/decisions.md](docs/decisions.md)
- 키 발급과 초기 세팅: [docs/setup.md](docs/setup.md)

## 개발

```
npm install
npm run dev      # 로컬 개발 서버 (.env 필요)
npm run build    # 타입 검사 + 프로덕션 빌드
```

`main`에 푸시하면 GitHub Actions가 빌드해 GitHub Pages에 배포한다.
