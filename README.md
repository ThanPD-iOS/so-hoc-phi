# Sổ học phí

Web app cho iPhone: điểm danh và tính học phí theo buổi, nhiều lớp. Dữ liệu chỉ nằm trên máy, chạy offline sau lần mở đầu. Thiết kế luồng và quy tắc tính nằm ở `Docs/flow.html`, chỉ giữ trên máy, không đưa lên repo.

## Cấu trúc

- `index.html`, `css/app.css`: khung trang và giao diện.
- `js/model.js`: dữ liệu và mọi quy tắc tính buổi, tính tiền. Không đụng tới DOM.
- `js/date.js`: ngày dạng `YYYY-MM-DD` theo giờ trên điện thoại.
- `js/app.js`: các màn hình (A1 đến G3, đúng mã trong flow.html) và thao tác.
- `js/export.js`, `js/xlsx.js`: file Excel của tháng, tự ghi .xlsx, không dùng thư viện ngoài.
- `js/store.js`: lưu một khối JSON trong `localStorage`.
- `sw.js`, `manifest.webmanifest`, `icons/`: cài lên màn hình chính và chạy offline.

Không có bước build, không cần Node.

## Chạy thử trên máy

```sh
python3 -m http.server 8765
```

- App: http://localhost:8765/
- Test logic: http://localhost:8765/tests/ (tiêu đề tab hiện `PASS n` hoặc `FAIL n`)
- Ảnh các màn hình ở khổ iPhone, ngày giả là 13/10/2026: http://localhost:8765/tests/screens.html?g=1 (nhóm 1 đến 6)

Chạy test không cần mở trình duyệt:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --virtual-time-budget=5000 \
  --dump-dom http://127.0.0.1:8765/tests/ | grep -o '[0-9]*/[0-9]* passed'
```

## Deploy lên GitHub Pages

1. Đẩy cả thư mục này lên một repo GitHub.
2. Settings → Pages → Deploy from a branch → nhánh `main`, thư mục `/ (root)`.
3. **Mỗi lần deploy bản mới, tăng `VERSION` trong `sw.js`.** Nếu không tăng, điện thoại sẽ tiếp tục dùng bản cũ đã lưu trong bộ nhớ đệm. Bản mới có hiệu lực từ lần mở app tiếp theo.

Trên iPhone: mở link bằng Safari → Chia sẻ → Thêm vào MH chính → mở app từ biểu tượng.
