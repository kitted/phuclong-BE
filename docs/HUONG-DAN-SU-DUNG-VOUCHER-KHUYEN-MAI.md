# Hướng dẫn sử dụng Voucher & Khuyến mãi

**Phiên bản tài liệu:** 07/10/2026  
**Đối tượng sử dụng:** Quản trị viên, quản lý bán hàng, nhân viên kinh doanh và kế toán

## 1. Mục đích

Chức năng **Khuyến mãi** hỗ trợ hai nghiệp vụ riêng biệt:

1. **Mã tặng hàng nhanh:** tạo mã để tặng sản phẩm hiện vật cho một khách hàng cụ thể.
2. **Voucher giảm giá:** tạo voucher giảm một số tiền cố định hoặc giảm theo phần trăm, có thể dùng chung hoặc cấp riêng cho khách hàng.

> Hai loại mã có mục đích khác nhau. Nếu cần tặng chai nhớt, phụ tùng hoặc quà hiện vật, hãy dùng **Mã tặng hàng nhanh**. Nếu cần trừ tiền trên hóa đơn, hãy dùng **Voucher giảm giá**.

## 2. Truy cập chức năng

Từ trang quản trị, vào:

**Khuyến mãi → Tạo mã khuyến mãi nhanh cho khách**

Tại khu vực này có hai lựa chọn:

- **Mã tặng hàng nhanh**
- **Voucher giảm giá**

## 3. Tạo mã tặng hàng nhanh

### 3.1. Khi nào sử dụng

Dùng khi doanh nghiệp muốn cấp mã tặng một sản phẩm cụ thể cho khách hàng, ví dụ tặng chai súc động cơ, áo thun hoặc phụ tùng.

### 3.2. Các bước thực hiện

1. Chọn tab **Mã tặng hàng nhanh**.
2. Nhập tiền tố mã nếu cần phân biệt chiến dịch.
3. Chọn **sản phẩm tặng**.
4. Chọn **nhân viên phụ trách**.
5. Chọn **khách hàng nhận mã**.
6. Chọn kho hoặc xe xuất hàng.
7. Nhập số lượng quà tặng.
8. Kiểm tra mã được hệ thống tạo ra và tình trạng tồn kho.
9. Bấm lưu để phát hành mã.

Sau khi tạo, có thể sao chép mã gửi khách, chỉnh sửa thông tin được phép hoặc xuất danh sách theo nhu cầu vận hành.

### 3.3. Lưu ý

- Kiểm tra đúng khách hàng trước khi lưu.
- Kiểm tra tồn kho tại đúng kho hoặc xe được chọn.
- Không dùng loại mã này để giảm trực tiếp tiền hóa đơn.

## 4. Tạo voucher giảm giá

Chọn tab **Voucher giảm giá**. Biểu mẫu được thiết kế thành 5 bước và mỗi lần chỉ hiển thị một bước:

1. Thông tin
2. Mức giảm
3. Giới hạn
4. Đối tượng
5. Thời gian

Điền đủ trường bắt buộc ở bước hiện tại để mở nút **Tiếp tục**. Trong một bước, trường tiếp theo chỉ xuất hiện sau khi thông tin bắt buộc trước đó hợp lệ.

Sau khi chuyển bước, các bước đã hoàn thành vẫn hiển thị phía trên và có thể chỉnh sửa trực tiếp. Nút tiếp tục của bước hiện tại chỉ được mở khi dữ liệu sau chỉnh sửa vẫn hợp lệ.

Các điều kiện nâng cao như ngân sách, giới hạn lượt dùng, quy đổi điểm, phạm vi hàng hóa, nhóm khách và thời gian đều có ô hỏi nhu cầu. Chỉ bật lựa chọn cần sử dụng; các trường chi tiết tương ứng mới xuất hiện.

Di chuột lên biểu tượng dấu hỏi màu xám cạnh tên trường để xem giải thích và ví dụ sử dụng.

### 4.1. Thông tin chung và đối tượng sử dụng

Nhập:

- **Mã voucher:** mã khách sẽ nhập khi lập hóa đơn, ví dụ `MOTUL50`.
- **Tên chương trình:** tên nội bộ giúp nhân viên nhận biết chiến dịch.
- **Đối tượng sử dụng:**
  - **Dùng chung:** nhiều khách hàng có thể dùng cùng một mã.
  - **Riêng cho khách hàng:** mã chỉ thuộc về khách hàng được chọn.

Khi chọn **Riêng cho khách hàng**:

1. Tìm và chọn đúng khách hàng.
2. Kiểm tra số dư điểm hóa đơn và coin PlusEx đang hiển thị.
3. Nếu voucher có quy đổi điểm/coin, hệ thống sẽ trừ khi phát hành voucher.

> Voucher dùng chung vẫn phải được áp dụng trên hóa đơn có khách hàng để hệ thống kiểm soát số lần sử dụng theo khách.

### 4.2. Thiết lập mức giảm

Có hai cách giảm:

#### Giảm số tiền cố định

Ví dụ:

- Giá trị giảm: `50.000đ`
- Giá trị đơn hàng tối thiểu: `500.000đ`

Khi hóa đơn đủ điều kiện, hệ thống giảm đúng 50.000đ.

#### Giảm theo phần trăm

Ví dụ:

- Tỷ lệ giảm: `10%`
- Giảm tối đa: `100.000đ`
- Giá trị đơn hàng tối thiểu: `500.000đ`

Nếu phần giảm tính theo 10% lớn hơn 100.000đ, hệ thống chỉ giảm tối đa 100.000đ.

### 4.3. Bảo vệ lợi nhuận

#### Giá trị đơn hàng tối thiểu

Hóa đơn phải đạt mức tối thiểu mới được dùng voucher. Nên đặt mức này cao hơn giá trị giảm đủ để bảo vệ biên lợi nhuận.

#### Ngân sách chiến dịch

Bật **Cần giới hạn ngân sách chiến dịch** rồi nhập tổng số tiền giảm của toàn chiến dịch. Ví dụ ngân sách `5.000.000đ` nghĩa là hệ thống ngừng chấp nhận voucher khi lần giảm tiếp theo làm vượt ngân sách.

Hệ thống không tự giảm một phần để dùng hết số ngân sách còn lại.

#### Không áp dụng đồng thời

Tắt lựa chọn cho phép dùng chung nếu không muốn voucher được cộng dồn với chương trình khuyến mãi, combo hoặc ưu đãi khác.

### 4.4. Giới hạn sử dụng

Bật **Cần tùy chỉnh giới hạn lượt dùng** nếu muốn thay đổi cấu hình mặc định. Có ba lớp giới hạn:

- **Tổng lượt dùng của chiến dịch:** tổng số lần tất cả khách được sử dụng. Nhập `0` để không giới hạn.
- **Lượt dùng trên mỗi voucher:** số lần riêng một mã được dùng. Nhập `0` để không giới hạn.
- **Lượt dùng trên mỗi khách hàng:** số lần một khách được dùng; phải nhập ít nhất `1`.

Khi nhiều giới hạn được thiết lập cùng lúc, giới hạn đạt trước sẽ được áp dụng trước.

Ví dụ:

- Tổng lượt: 1.000
- Mỗi voucher: không giới hạn
- Mỗi khách: 1

Kết quả: chiến dịch có thể phát sinh tối đa 1.000 lượt, nhưng mỗi khách chỉ dùng được một lần.

### 4.5. Quy đổi điểm hoặc coin PlusEx

Nguồn quy đổi gồm:

- **Không quy đổi**
- **Điểm hóa đơn**
- **Coin PlusEx**

Quy đổi chỉ áp dụng khi voucher được cấp riêng cho một khách hàng.

Quy trình:

1. Chọn khách hàng.
2. Chọn nguồn quy đổi.
3. Nhập số điểm hoặc coin cần trừ.
4. Lưu voucher.

Nếu khách không đủ số dư, hệ thống không phát hành voucher và không để lại chương trình/voucher dở dang.

> Điểm hoặc coin được trừ tại thời điểm phát hành, không phải khi khách sử dụng trên hóa đơn.

### 4.6. Phạm vi sản phẩm

Bật **Chỉ áp dụng một số hàng** nếu voucher không áp dụng cho toàn bộ hàng hóa. Có thể chọn:

- Toàn bộ sản phẩm
- Danh mục được chọn
- Sản phẩm được chọn

Bật **Cần loại trừ hàng hóa** để thiết lập:

- Danh mục bị loại trừ
- Sản phẩm bị loại trừ

Quy tắc loại trừ được ưu tiên. Nếu một sản phẩm vừa thuộc phạm vi áp dụng vừa nằm trong danh sách loại trừ, sản phẩm đó không được tính giảm giá.

Nếu hóa đơn không có sản phẩm hợp lệ, voucher sẽ không được áp dụng.

### 4.7. Nhắm đúng nhóm khách hàng

Bật **Chỉ áp dụng nhóm khách** để giới hạn voucher theo phân nhóm khách hàng, ví dụ khách VIP, khách sỉ hoặc đại lý cấp 1.

Để tạo chương trình gọi khách cũ quay lại, bật **Dùng để gọi khách cũ** rồi nhập số tháng không phát sinh hóa đơn.

Ví dụ nhập `5`: voucher chỉ hợp lệ với khách không phát sinh đơn hàng trong ít nhất 5 tháng theo dữ liệu hệ thống.

### 4.8. Thời gian sử dụng

Bật **Cần giới hạn thời gian hiệu lực** nếu voucher không được dùng vô thời hạn. Sau đó thiết lập các điều kiện cần dùng:

- Ngày bắt đầu và ngày kết thúc chiến dịch
- Bật **Cần hạn dùng tính từ ngày cấp** để nhập số ngày hết hạn động.
- Bật **Cần giới hạn theo thứ hoặc giờ** để chọn các thứ được phép sử dụng và giờ bắt đầu/kết thúc trong ngày.

Ví dụ flash sale:

- Thứ Sáu
- Từ 12:00 đến 14:00

Nếu sử dụng hạn động, hạn của voucher vẫn không được vượt quá ngày kết thúc chiến dịch.

### 4.9. Lưu và kiểm tra

Trước khi bấm lưu, kiểm tra lại:

- Mã voucher và tên chiến dịch
- Đối tượng dùng chung hay khách cụ thể
- Mức giảm, giảm tối đa và đơn hàng tối thiểu
- Ngân sách
- Các giới hạn lượt dùng
- Điểm/coin cần quy đổi
- Sản phẩm, danh mục áp dụng và loại trừ
- Nhóm khách hàng
- Ngày, thứ và khung giờ hiệu lực

Sau khi lưu thành công, tải lại danh sách để xác nhận chương trình đã xuất hiện và đúng trạng thái.

## 5. Áp dụng voucher khi lập hóa đơn

1. Tạo hóa đơn và chọn khách hàng CRM.
2. Thêm sản phẩm bán vào hóa đơn.
3. Nhập mã voucher.
4. Bấm kiểm tra hoặc áp dụng voucher.
5. Xem số tiền giảm và tổng thanh toán sau giảm.
6. Xác nhận hóa đơn nếu thông tin đúng.

Hệ thống lần lượt kiểm tra:

- Mã có tồn tại và thuộc đúng khách hàng hay không
- Chương trình và voucher còn hiệu lực hay không
- Điều kiện về nhóm khách hoặc thời gian không mua hàng
- Ngày, thứ và khung giờ sử dụng
- Giá trị đơn hàng tối thiểu
- Phạm vi sản phẩm được giảm
- Điều kiện không cộng dồn
- Giới hạn lượt dùng
- Ngân sách còn lại

Việc chỉ xem trước hoặc kiểm tra mã không làm tăng lượt sử dụng. Lượt dùng và ngân sách chỉ được ghi nhận khi hóa đơn được xác nhận thành công.

## 6. Hủy hoặc đảo hóa đơn đã dùng voucher

Khi nghiệp vụ đảo/hủy hóa đơn được thực hiện thành công, hệ thống hoàn lại:

- Một lượt sử dụng của voucher
- Một lượt sử dụng của khách hàng trong chiến dịch
- Số ngân sách đã ghi nhận cho phần giảm giá

Nhân viên nên kiểm tra lại lịch sử hóa đơn và số liệu chiến dịch sau khi đảo hóa đơn.

## 7. Quản lý mã voucher và thống kê

Khi chọn tab **Voucher giảm giá**, phía dưới biểu mẫu có khu vực **Quản lý mã voucher**.

Mỗi mã hiển thị:

- Mã voucher và nút sao chép
- Chương trình phát hành
- Khách hàng được cấp hoặc trạng thái mã dùng chung
- Trạng thái và số lượt đã sử dụng
- Ngày cấp và hạn sử dụng
- Từng hóa đơn đã dùng mã
- Khách hàng, số điện thoại và số tiền giảm trên hóa đơn
- Tổng số tiền đã giảm của mã

Có thể lọc theo:

- Hôm nay
- Tháng hiện tại
- Khoảng ngày tùy chọn
- Toàn bộ thời gian
- Trạng thái voucher
- Mã voucher, chương trình hoặc khách hàng

Các thẻ thống kê hiển thị số mã có phát sinh, số mã đã dùng, tổng lượt sử dụng, số khách sử dụng và tổng tiền giảm trong bộ lọc hiện tại.

Bấm **Xuất Excel** để tải toàn bộ dữ liệu phù hợp bộ lọc, không chỉ các dòng đang hiển thị trên trang hiện tại.

Sau khi cấp voucher, mã vừa tạo được hiển thị nổi bật. Bấm **Sao chép mã** trước khi đóng hộp thoại để gửi cho khách hàng.

## 8. Các mẫu thiết lập tham khảo

### Mẫu 1: Mã dùng chung giảm 50.000đ

- Mã: `MOTUL50`
- Đối tượng: Dùng chung
- Loại giảm: Số tiền cố định
- Giá trị giảm: 50.000đ
- Đơn tối thiểu: 500.000đ
- Ngân sách: 5.000.000đ
- Mỗi khách: 1 lần
- Không cộng dồn ưu đãi

### Mẫu 2: Voucher VIP giảm 10%

- Đối tượng: Dùng chung
- Loại giảm: Phần trăm
- Tỷ lệ: 10%
- Giảm tối đa: 100.000đ
- Đơn tối thiểu: 1.000.000đ
- Nhóm khách: VIP
- Mỗi khách: 1 lần

### Mẫu 3: Voucher gọi khách cũ quay lại

- Đối tượng: Riêng cho khách hàng
- Nguồn quy đổi: Coin PlusEx
- Chi phí quy đổi: theo chính sách đang áp dụng
- Điều kiện không mua hàng: 5 tháng
- Hạn động: 7 ngày kể từ khi phát hành
- Mỗi khách: 1 lần

## 9. Xử lý lỗi thường gặp

| Thông báo/tình trạng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Không tìm thấy voucher | Nhập sai mã hoặc mã không tồn tại | Kiểm tra lại ký tự, khoảng trắng và mã đã phát hành |
| Voucher không thuộc khách hàng | Mã được cấp riêng cho khách khác | Chọn đúng khách hoặc phát hành voucher mới |
| Chương trình chưa bắt đầu/đã kết thúc | Ngoài thời gian chiến dịch | Kiểm tra ngày bắt đầu và kết thúc |
| Voucher đã hết hạn | Hết hạn cố định hoặc hạn động | Phát hành mã mới nếu chính sách cho phép |
| Đơn hàng chưa đạt tối thiểu | Tổng hàng hợp lệ chưa đủ điều kiện | Bổ sung hàng hợp lệ hoặc dùng voucher khác |
| Không có sản phẩm đủ điều kiện | Sản phẩm không nằm trong phạm vi hoặc bị loại trừ | Kiểm tra cấu hình danh mục/sản phẩm |
| Không đúng khung giờ/ngày áp dụng | Ngoài lịch đã cấu hình | Dùng mã trong đúng thời gian |
| Khách hàng không đúng phân nhóm | Hạng/nhóm khách không hợp lệ | Kiểm tra thông tin phân nhóm khách hàng |
| Khách chưa đủ thời gian không mua hàng | Chưa đạt điều kiện win-back | Kiểm tra hóa đơn gần nhất của khách |
| Đã hết lượt sử dụng | Đạt giới hạn chiến dịch, voucher hoặc khách hàng | Kiểm tra thống kê lượt dùng |
| Ngân sách không đủ | Lần giảm tiếp theo làm vượt ngân sách | Tăng ngân sách có phê duyệt hoặc dùng chương trình khác |
| Không đủ điểm/coin | Số dư thấp hơn chi phí phát hành | Giảm mức quy đổi hoặc bổ sung số dư đúng nghiệp vụ |
| Không được cộng dồn | Hóa đơn đang có ưu đãi khác | Bỏ ưu đãi còn lại hoặc dùng voucher cho phép cộng dồn |

## 10. Checklist vận hành trước khi kích hoạt

- [ ] Thử voucher trên hóa đơn mẫu.
- [ ] Kiểm tra đơn hàng tối thiểu và mức giảm tối đa.
- [ ] Kiểm tra ngân sách chiến dịch.
- [ ] Kiểm tra phạm vi sản phẩm và danh sách loại trừ.
- [ ] Kiểm tra đúng nhóm khách hàng.
- [ ] Kiểm tra giới hạn mỗi khách và tổng lượt dùng.
- [ ] Kiểm tra ngày, thứ và khung giờ.
- [ ] Xác nhận có hoặc không cho cộng dồn.
- [ ] Với mã riêng, kiểm tra đúng khách và đủ điểm/coin.
- [ ] Thông báo quy tắc sử dụng cho nhân viên bán hàng.

## 11. Phạm vi phiên bản hiện tại

Phiên bản hiện tại hỗ trợ voucher giảm tiền cố định, giảm theo phần trăm có mức trần, mã dùng chung hoặc riêng cho khách, quy đổi điểm/coin, giới hạn ngân sách/lượt dùng, phạm vi sản phẩm, phân nhóm khách, win-back và lịch sử dụng.

Các ý tưởng sau **chưa phải loại quyền lợi riêng trong màn hình Voucher giảm giá**:

- **Freeship/hỗ trợ phí vận chuyển:** chưa có vì hóa đơn hiện chưa quản lý một trường phí vận chuyển riêng để voucher khấu trừ.
- **Giảm lũy tiến nhiều bậc:** chưa có cấu hình nhiều mức giảm trong cùng một voucher.
- **Quà tặng hiện vật:** thực hiện bằng tab **Mã tặng hàng nhanh**, không cấu hình dưới dạng voucher giảm giá.

Khi triển khai hệ thống, cần cập nhật đồng thời phiên bản Backend và trang quản trị để biểu mẫu mới và các quy tắc kiểm tra hóa đơn hoạt động thống nhất.
