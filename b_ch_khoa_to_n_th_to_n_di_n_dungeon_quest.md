# BÁCH KHOA TOÀN THƯ TOÀN DIỆN: CHỈ SỐ, HỆ THỐNG TRANG BỊ & NGUYÊN TỐ DUNGEON QUEST

> **Ghi chú sử dụng**: Tài liệu được biên soạn để tra cứu trực tiếp toàn bộ thuật ngữ tiếng Anh gốc trong game kèm định nghĩa chi tiết cơ chế hoạt động, phân loại vị trí trang bị, công thức tính toán và chỉ số trần (*Cap*).

---

## MỤC LỤC
1. [Cấu Trúc Trang Bị & Màu Sắc Thuộc Tính (Affix Architecture)](#1-cấu-trúc-trang-bị--màu-sắc-thuộc-tính)
2. [Hệ Thống Phẩm Chất Vật Phẩm (Rarity Tiers)](#2-hệ-thống-phẩm-chất-vật-phẩm)
3. [Từ Điển Nhóm Chỉ Số Căn Bản, Epic & Crystal Affixes](#3-từ-điển-nhóm-chỉ-số-căn-bản-epic--crystal-affixes)
4. [Hệ Thống Talent Phân Bổ Theo 4 Món Phòng Thủ & Phụ Kiện](#4-hệ-thống-talent-phân-bổ-theo-4-món-phòng-thủ--phụ-kiện)
5. [Nhóm Thuộc Tính Tree / Mastery Talents (+All Skills)](#5-nhóm-thuộc-tính-tree--mastery-talents)
6. [Cơ Chế Bạo Kích Nguyên Tố (Elemental Crit & DoT Synergies)](#6-cơ-chế-bạo-kích-nguyên-tố)
7. [Hệ Thống Cơ Chế Kích Hoạt Tự Động (Proc Mechanics)](#7-hệ-thống-cơ-chế-kích-hoạt-tự-động-proc)
8. [Từ Điển Set Affixes Toàn Tập (Màu Xanh Lá)](#8-từ-điển-set-affixes-toàn-tập)
9. [Hệ Thống Resource Mythic (Quản Lý Tài Nguyên Độc Quyền)](#9-hệ-thống-resource-mythic)
10. [Bảng Tra Cứu Toàn Bộ 40 Loại Mythstones](#10-bảng-tra-cứu-toàn-bộ-40-loại-mythstones)
11. [Bảng Tổng Hợp Công Thức Ghép Đồ Đỏ (Mythic Recipes)](#11-bảng-tổng-hợp-công-thức-ghép-đồ-đỏ)
12. [Bảng Chỉ Số Trần Cốt Lõi (Stat Caps) & Cơ Chế Giảm Thiểu Sát Thương](#12-bảng-chỉ-số-trần-cốt-lõi-stat-caps)

---

## 1. CẤU TRÚC TRANG BỊ & MÀU SẮC THUỘC TÍNH

Một bộ trang bị hoàn chỉnh gồm 6 vị trí: **Main-hand (MH Weapon)**, **Off-hand (OH Weapon)**, **Chest (Áo)**, **Head (Mũ)**, **Ring (Nhẫn)**, **Amulet (Dây chuyền)**. Tổng cộng có tối đa 42 slot thuộc tính (7 slot mỗi món khi đạt tối đa socket/affix).

Màu sắc của từng dòng thuộc tính biểu thị nguồn gốc và cách điều chỉnh:
* **Chữ Trắng (Base Stats)**: Chỉ số gốc của vũ khí và giáp (Base Weapon DMG, Base Armor, Base Attack Speed).
* **Chữ Vàng (Normal Affixes)**: Các dòng chỉ số cơ bản nhỏ nhất, can thiệp bằng đá *Larimar* hoặc rơi tự nhiên.
* **Chữ Tím (Epic Affixes)**: Các dòng chỉ số nâng cấp thông thường, roll bằng đá *Topaz* (đổi giá trị) hoặc *Diamond* (đổi dòng).
* **Chữ Cam Đậm (Legend Affixes)**: Thuộc tính Huyền thoại độc quyền thay đổi cơ chế kỹ năng, tạo ra từ đá *Ruby*.
* **Chữ Xanh Biển Nhạt / Cyan (Crystal Affixes)**: Dòng chỉ số siêu cấp sở hữu giá trị gấp 3 lần dòng Epic tương đương. Chỉ xuất hiện từ rơi tự nhiên hoặc roll ngẫu nhiên bằng đá *Obsidian*. Mỗi món đồ chỉ được mang duy nhất 1 dòng Crystal Affix.
* **Chữ Xanh Lá Mạ (Set Affixes)**: Thuộc tính bộ trang bị (Rank 1 đến Rank 20), có thể tẩy/đổi bằng đá *Amethyst* (hoặc từ đồ Legend rơi cố định).
* **Chữ Đỏ Tươi / Tím Đậm (Mythic Affixes)**: Thuộc tính tối thượng kích hoạt sau khi khảm đủ 4 viên đá Mythstone theo đúng thứ tự công thức.

---

## 2. HỆ THỐNG PHẨM CHẤT VẬT PHẨM

1. **Normal (Trắng)**: Đồ trắng cơ bản, không có thuộc tính phụ.
2. **Magic (Xanh dương)**: Có 1–2 dòng thuộc tính ngẫu nhiên.
3. **Rare (Vàng)**: Có 2–4 dòng thuộc tính.
4. **Epic (Tím)**: Có 4–5 dòng thuộc tính chỉ số cao.
5. **Legendary (Cam)**: Có dòng nội tại biến đổi kỹ năng, rơi từ quái hoặc nâng từ đồ Epic bằng đá *Ruby*.
6. **Mythic (Đỏ)**: **Không rơi tự nhiên**, được tạo ra từ quá trình khảm 4 viên đá Mythstone vào đồ có 4 lỗ cắm.
7. **Eternal (Xanh Lục Bảo - Emerald)**: **Chỉ rơi từ quái**, xuất hiện từ cấp độ khó Torment. Toàn bộ chỉ số nền của đồ Eternal cao hơn đồ Legendary **50%**.
8. **Eternal Mythic**: Đỉnh cao trang bị – Người chơi lấy phôi đồ Eternal đục 4 lỗ và khảm Mythstones vào, tạo ra trang bị vừa có 50% chỉ số gốc vượt trội vừa mang nội tại Mythic tối thượng.

---

## 3. TỪ ĐIỂN NHÓM CHỈ SỐ CĂN BẢN, EPIC & CRYSTAL AFFIXES

### 3.1. Nhóm Tấn Công (Offensive)
* **Weapon DMG +**: Cộng thẳng một lượng sát thương cố định vào vũ khí trước khi nhân các hệ số phần trăm.
* **Weapon DMG % (WD%)**: Tăng phần trăm sát thương vũ khí cơ bản (tối đa +100% trên đồ Epic, +150% trên Crystal Affix).
* **Elemental DMG % (ED%)**: Tăng % sát thương theo đúng hệ nguyên tố của vũ khí (Fire, Ice, Shock, Poison, Arcane).
* **Attack Speed**: Gia tăng tốc độ xuất chiêu và tốc độ chém/bắn (Cap: 60%).
* **Extra Attack Chance**: Tỷ lệ tung thêm 1 đòn đánh cơ bản phụ gây 100% sát thương.
* **Multi Attack**: Tỷ lệ xuất hiện thêm một lượt tấn công phụ kèm theo (gây 50% sát thương).
* **Critical Hit Chance**: Tỷ lệ gây sát thương bạo kích (Cap cơ bản: 60%).
* **Critical Hit Damage**: Khuếch đại sát thương bạo kích (Mặc định 150%, Cap tối đa: 350%).
* **Deadly Strike**: Tỷ lệ đòn bạo kích gây sát thương gấp 2 lần (hoặc gấp 3 lần nếu có Mythic Brutal).
* **Crushing Blow**: Tỷ lệ gây sát thương tức thì tương đương 25% lượng máu hiện tại của quái vật.
* **Weaken**: Nhân hệ số sát thương trực tiếp lên quái sau khi đã trừ toàn bộ kháng cự.
* **Ignore Resist**: Bỏ qua 100% chỉ số kháng của quái vật (không tương tác cộng dồn với Weaken).
* **AoE Range**: Mở rộng bán kính vùng ảnh hưởng của các chiêu thức diện rộng.

### 3.2. Nhóm Phòng Ngự & Sinh Tồn (Defensive)
* **All Resist (AR)**: Kháng toàn bộ 5 hệ nguyên tố. Đóng vai trò sống còn ở Torment. **Cap: 75%** (Tối đa 80% với một số hiệu ứng chuyên biệt).
* **Armor**: Giáp vật lý, giảm sát thương vật lý trực tiếp gánh chịu.
* **Dodge Chance**: Tỷ lệ né tránh hoàn toàn đòn đánh (Cap: 60%, lên 75% với Talent/Trickster).
* **Block Chance**: Tỷ lệ chặn đứng đòn đánh bằng khiên (Cap: 60%, lên 75% với Shield Wall).
* **HP on Hit / MP on Hit**: Lượng máu/mana hồi phục ngay lập tức trên mỗi đòn đánh chạm mục tiêu (không phụ thuộc vào quái vật tầng cao).
* **HP Leech / MP Leech**: Hút máu/mana theo % sát thương gây ra (bị suy giảm mạnh ở các tầng Torment sâu).
* **Damage Reduction**: Giảm trừ trực tiếp % sát thương nhận vào sau khi đã tính qua Giáp và Kháng.

---

## 4. HỆ THỐNG TALENT PHÂN BỔ THEO 4 MÓN PHÒNG THỦ & PHỤ KIỆN

Trong cấu trúc dữ liệu của game, các Talent (kỹ năng nội tại) xuất hiện cố định trên 4 vị trí trang bị theo cấp bậc (Staggered Levels):

### 4.1. Vị trí Áo Giáp (Chest - Yêu cầu Item Level 6+)
* **Cosmic**: Tăng thẳng chỉ số Kháng toàn diện (+10 All Resist mỗi rank).
* **Sorcery**: Tăng % hiệu quả của các hiệu ứng nguyên tố (+5% Element Effect Effectiveness).
* **Barrier**: Giảm lượng MP tiêu hao khi duy trì kỹ năng Mana Shield (-1.5% MP Cost mỗi rank).
* **Focus**: Tăng % sát thương cơ bản của vũ khí (+2% Weapon DMG mỗi rank).
* **Necrotic**: Tăng % sát thương cho kỹ năng Đầu Lâu (+2.5% Skull DMG mỗi rank).
* **Prowess**: Tăng % sát thương đòn đánh của Đệ (+2.5% Minion DMG mỗi rank).

### 4.2. Vị trí Mũ (Head - Yêu cầu Item Level 11+)
* **Wizardry**: Tăng tỷ lệ bạo kích riêng cho sát thương nguyên tố (+1% Elemental Critical Chance).
* **Amplify**: Khuếch đại sát thương (+5% DMG) cho mỗi loại hiệu ứng nguyên tố khác nhau đang cùng dính trên mục tiêu.
* **Insight**: Tăng +1% Dodge và hồi lại % MP trên mỗi cú né đòn thành công.
* **Backfire**: Khiến lớp khiên Mana Shield phản ngược lại +10% sát thương khi có quái tấn công trúng.
* **Infusion**: Áp dụng chỉ số All Resist trực tiếp lên thanh Mana Shield (giúp khiên MP nhận khả năng giảm trừ thương tích lên tới 75%).
* **Boost**: Tăng +1% Tốc độ di chuyển và tốc độ tấn công cho Minion.
* **Hearty**: Tăng +1.5% Lượng Máu tối đa cho Minion.

### 4.3. Vị trí Nhẫn (Ring - Yêu cầu Item Level 16+)
* **Astral**: Tăng Elemental DMG dựa trên 0.2% tổng chỉ số All Resist (Càng trâu kháng bao nhiêu thì đánh phép càng mạnh bấy nhiêu).
* **Magnify**: Mở rộng bán kính tác động của kỹ năng diện rộng (+0.2% AoE Range).
* **Continuity**: Chiêu thức TimeWarp làm chậm thêm 2.5% tốc độ tấn công cận chiến của quái vật.
* **Bewilder**: Các tia đạn bắn bay ra (Projectiles) có thêm +1.5% tỷ lệ làm choáng (Stun).
* **Diffusion**: Chuyển +2.5% sát thương người chơi gánh chịu sang cho đội quân Minion chịu hộ.
* **Spiritual**: Tăng +1% Tốc độ hồi phục sinh lực tự động cho Minion.

### 4.4. Vị trí Dây Chuyền (Amulet - Yêu cầu Item Level 21+)
* **Prismatic**: Có thêm +2.5% tỷ lệ tự động tung ra các đòn tấn công nguyên tố ngẫu nhiên khác.
* **Fester**: Kéo dài thêm +2.5% thời gian duy trì của các hiệu ứng nguyên tố (Burn, Freeze, Shock...).
* **Mastery**: Giảm thời gian hồi chiêu (+0.5% Cooldown Reduction).
* **Empower**: Tăng +2.5% Power, đổi lại giảm -2.5% Max HP (Lối chơi Glass Cannon).
* **Reclaim**: Có +1% tỷ lệ tự động dựng khiên xương Skull Shield mỗi khi xuất chiêu.
* **Recall**: Có +1% tỷ lệ tự động triệu hồi thêm Minion mới mỗi khi tung đòn tấn công.

---

## 5. NHÓM THUỘC TÍNH TREE / MASTERY TALENTS

Xuất hiện từ giá trị `+1` đến `+4` (hoặc `+6` trên đồ Crystal). Dòng này tăng cấp hàng loạt cho toàn bộ các kỹ năng nội tại thuộc một bảng chuyên môn mà người chơi đã mở khóa ít nhất 1 điểm:

### 5.1. Dành cho Wizard (Pháp Sư)
* **`+X All Elementalist`**: Tăng đồng loạt cấp độ cho tất cả Talent thuộc nhánh Nguyên tố (Lửa, Băng, Sét, Độc, Arcane).
* **`+X All Arch Mage`**: Tăng cấp đồng loạt cho toàn bộ Talent nhánh Quản lý Mana và Phòng ngự phép thuật: *Barrier, Infusion, Empower, Insight, Backfire, Focus, Magnify*.
* **`+X All Spiritmancer`**: Tăng cấp đồng loạt cho toàn bộ Talent nhánh Gọi Hồn & Triệu hồi: *Sacrifice, Necrotic, Prowess, Boost, Hearty, Diffusion, Spiritual, Recall, Reclaim*.

### 5.2. Dành cho Warrior (Chiến Binh)
* **`+X All Champion`**: Tăng cấp cho nhánh Chiến đấu, đòn quét vũ khí và sát thương cơ bản.
* **`+X All Defender`**: Tăng cấp cho nhánh Giáp, Khiên chắn (*Shield Wall*), phản đòn và chỉ số Kháng.
* **`+X All Berserker`**: Tăng cấp cho nhánh Nộ khí, tốc độ đánh cuồng bạo và dồn sát thương liều mạng.

### 5.3. Dành cho Rogue (Sát Thủ / Xạ Thủ)
* **`+X All Trickster`**: Tăng cấp cho nhánh Né đòn (*Dodge*), tàng hình và bẫy rập.
* **`+X All Ranger`**: Tăng cấp cho nhánh Cung tên, tầm bắn xa và đạn xuyên thấu.
* **`+X All Assassin`**: Tăng cấp cho nhánh Độc tố, Dao găm cận chiến và tỷ lệ bạo kích chết chóc.

### 5.4. Dòng Tối Thượng Chung
* **`+X All Talents`**: Tăng cấp cho toàn bộ kỹ năng thuộc cả 3 nhánh chuyên môn của lớp nhân vật đang sử dụng.

---

## 6. CƠ CHẾ BẠO KÍCH NGUYÊN TỐ

Khi đòn đánh bạo kích mang sát thương nguyên tố nổ ra, các dòng thuộc tính sau sẽ kích hoạt cơ chế khuếch đại sát thương riêng biệt:

| Tên Dòng Affix | Hệ Nguyên Tố | Cơ Chế Kích Hoạt & Hiệu Quả |
| :--- | :--- | :--- |
| **Frostbiting** | **Ice (Băng)** | Tăng cực mạnh % sát thương lên các mục tiêu đang bị trạng thái **Freeze (Đóng băng)**. |
| **Blistering** | **Fire (Lửa)** | Tạo hiệu ứng Chảy máu (*Bleed*) cộng dồn dựa trên sát thương thiêu đốt khi mục tiêu dính **Burn**. |
| **High Voltage** | **Shock (Sét)** | Khuếch đại sát thương bùng nổ lên các quái vật đang bị dính **Paralyze (Tê liệt)** hoặc **Stun (Choáng)**. |
| **Blight** | **Poison (Độc)** | Tăng tốc độ rút máu và nhân hệ số sát thương bạo kích cho các tầng sát thương độc duy trì (*Stacking DoT*). |
| **Celestial** | **Arcane (Huyền bí)** | Cường hóa sát thương các quả cầu quỹ đạo năng lượng (*Orbit*) xoay quanh mục tiêu. |

---

## 7. HỆ THỐNG CƠ CHẾ KÍCH HOẠT TỰ ĐỘNG (PROC)

Dungeon Quest vận hành cơ chế **Proc** (*Programmed Random Occurrence*) tính toán xác suất dựa trên mỗi đòn đánh tung ra (**On-Hit Proc**). Vì vậy, các vũ khí tốc độ cao (Flintlock, Dagger, Wand) kích hoạt các hiệu ứng này với tần suất cực lớn:

* **Summon Fury Proc (`+X% Summon Fury`)**: Tỷ lệ mỗi cú đánh sẽ tự động triệu hồi 1 tinh linh Fury Minion (tối đa 3 con). Đệ Fury hỗ trợ tấn công và làm bia đỡ đạn.
* **Meteor Proc (`+X% Meteor on Hit`)**: Tỷ lệ tự động gọi một quả cầu lửa khổng lồ rơi xuống dọn sạch bầy quái.
* **Comet Proc**: Triệu hồi thiên thạch băng gây choáng diện rộng.
* **Twister Proc**: Tạo ra các cơn lốc xoáy năng lượng tự di chuyển càn quét sàn đấu.
* **Skull Proc**: Tự động bắn ra các đầu lâu linh hồn phát nổ khi va chạm quái vật.

---

## 8. TỪ ĐIỂN SET AFFIXES TOÀN TẬP

Các dòng thuộc tính màu xanh lá có thể tích lũy từ Rank 1 đến Rank 20 để gia tăng chỉ số:

### 8.1. Các Set Roll Được Bằng Đá Amethyst
* **Ascendant**: Cường hóa sát thương hệ Arcane. Kéo dài thời gian Arcane Debuff trên quái lên 5 giây (thay vì biến mất ngay), đồng thời trừ tới 62.5% chỉ số Kháng các hệ khác của quái vật. Mảnh ghép bắt buộc cho build Arcane cao cấp.
* **Arcanist**: Tăng vọt lượng % Elemental DMG cho mỗi kẻ địch đang chịu trạng thái Arcane Debuff. Bắt buộc phải kết hợp cùng *Ascendant*.
* **Equality**: Tăng sát thương và tốc độ hồi phục toàn diện (+7.5% mỗi Rank) dựa trên mức độ cân bằng giữa thanh Máu (Max HP) và thanh Mana (Max MP). Đạt tối đa khi HP = MP.
* **Cosmic Power**: Gia tăng sát thương tổng thể và bán kính nổ của các kỹ năng hệ Không Gian/Arcane.
* **Plagued**: Đòn đánh độc lây lan sang các mục tiêu lân cận mỗi khi có một quái vật chết vì độc.
* **Reactor**: Mỗi khi áp dụng hiệu ứng Shock lên quái, một luồng sóng xung kích điện trường sẽ phát nổ quanh nhân vật.
* **Frozen**: Tăng mạnh tỷ lệ đóng băng kẻ địch và kéo dài thời gian khống chế.
* **Inferno**: Quái vật bị thiêu đốt sẽ phát nổ khi chết, gây sát thương lửa lan sang toàn bộ quái xung quanh.
* **Momentum**: Tăng sát thương đòn đánh kế tiếp dựa trên quãng đường di chuyển liên tục của nhân vật.
* **Rage**: Đòn đánh cận chiến tích lũy nộ khí, đẩy sát thương vật lý lên cực đại.
* **Terrashaper**: Kỹ năng đập đất tạo ra các bức tường đá nham thạch chắn đường và gây sát thương kéo dài.
* **Pathfinder**: Tăng tốc độ chạy và giúp nhân vật hoàn toàn miễn nhiễm với các hiệu ứng làm chậm trên mặt sàn.
* **Ninja**: Tăng chỉ số Dodge; lập tức tàng hình và tăng bạo kích sau khi hạ gục một mục tiêu.
* **Battle Mage**: Chuyển đổi một phần sát thương phép thuật thành chỉ số Giáp vật lý.
* **Demonic / Angelic**: Gia tăng thuộc tính đối lập giữa Hút máu hắc ám và Hồi phục ánh sáng.

### 8.2. Các Set Độc Quyền (Chỉ Rơi Từ Quái / Không Roll Được Bằng Amethyst)
* **Eternalized**: Tăng +50% tỷ lệ quái rơi trang bị phẩm chất **Eternal (Xanh Lục)** trên mỗi Rank của Set.
* **Crystalline**: Tăng mạnh tỷ lệ trang bị rơi ra sở hữu dòng chỉ số **Crystal Affix (Xanh Biển)**.
* **Mythical**: Tăng tỷ lệ nhặt được các viên đá Thần thoại **Mythstones** cấp cao.
* **Epiphany**: Nâng trần chỉ số Clearcast từ 60% lên **75%** và tăng thêm sát thương kỹ năng.
* **Nadroji**: Mở khóa tỷ lệ rơi trang bị độc quyền của Boss Nadroji và tăng mạnh tỷ lệ xuất hiện quái Elite.
* **Seven Deadly Sins**: Bộ trang bị đánh đổi các hiệu ứng bất lợi cực đoan để đổi lấy lượng sát thương khổng lồ.
* **Masochism**: Nhận thêm sức mạnh tấn công tương ứng với lượng sát thương mà nhân vật phải gánh chịu.
* **Defiant**: Tăng vọt chỉ số phòng thủ và giảm thương khi lượng máu tụt xuống dưới 35%.

---

## 9. HỆ THỐNG RESOURCE MYTHIC (QUẢN LÝ TÀI NGUYÊN)

> **Luật cốt lõi**: Trên toàn bộ 6 món trang bị, nhân vật **CHỈ ĐƯỢC PHÉP KÍCH HOẠT DUY NHẤT 1 RESOURCE MYTHIC**. Nếu khảm 2 Resource Mythic khác nhau, chỉ có 1 dòng hoạt động.

* **Blood Magic**: Bỏ hoàn toàn thanh Mana. Toàn bộ kỹ năng chuyển sang tiêu tốn Máu (HP). Máu người chơi càng thấp, sát thương gây ra càng khủng khiếp.
* **Energy**: Cố định thanh năng lượng ở mức 100 điểm với tốc độ hồi phục siêu tốc, không bị ảnh hưởng bởi chỉ số Max MP.
* **Fury**: Chuyển đổi toàn bộ cơ chế tiêu hao Mana thành hệ thống tích tụ Nộ Khí (Fury) của Chiến binh.
* **Alchemy**: Khiến việc sử dụng bình máu/mana tự động kích hoạt hồi phục cả 2 thanh tài nguyên cùng lúc và tăng cường hiệu ứng thuốc.
* **Equivalence**: Tự động cân bằng và ép thanh Max HP và Max MP về tỷ lệ **hoàn toàn bằng nhau (1:1)**. Kích hoạt vĩnh viễn 100% sức mạnh của Set *Equality*.
* **Harmony**: Chuyển đổi cơ chế hồi phục Máu và Mana bổ trợ lẫn nhau theo nhịp độ cố định.
* **Discordance**: Đảo ngược hoàn toàn các cơ chế tiêu thụ tài nguyên của trang bị.

---

## 10. BẢNG TRA CỨU TOÀN BỘ 40 LOẠI MYTHSTONES

| Thứ Tự | Tên Đá | Hiệu Ứng Thuộc Tính Khi Gắn Rời |
| :---: | :--- | :--- |
| **#1** | **Elona** | +% Vàng rơi ra (*Gold Find*) |
| **#2** | **Nadir** | +% Kinh nghiệm nhận được (*EXP Gain*) |
| **#3** | **Ber** | +% Tỷ lệ nhặt trang bị quý (*Magic Find / Luck*) |
| **#4** | **Vex** | +Lượng Máu phẳng (*Flat Health*) |
| **#5** | **Boon** | +Lượng Năng lượng phẳng (*Flat Mana*) |
| **#6** | **Clarity** | **+25% Clearcast** (Tung chiêu tiêu tốn 0 MP/Fury) |
| **#7** | **Gift** | +% Sát thương kỹ năng chính (*Main Skill DMG*) |
| **#8** | **Wisdom** | +% Giảm thời gian hồi chiêu (*Cooldown Reduction*) |
| **#9** | **Haste** | +% Tốc độ di chuyển (*Movement Speed*) |
| **#10** | **Quest** | +% Tỷ lệ xuất hiện quái Elite / Magic |
| **#11** | **Return** | +Lượng MP hồi phục khi đánh trúng địch (*MP on Hit*) |
| **#12** | **Endow** | +Lượng HP hồi phục khi đánh trúng địch (*HP on Hit*) |
| **#13** | **Death** | +% Tỷ lệ kết liễu kẻ địch dưới ngưỡng máu |
| **#14** | **Master** | +Cấp độ cho toàn bộ kỹ năng trong bảng Talent |
| **#15** | **Fortune** | +% Tỷ lệ quái rơi đồ phẩm chất cao |
| **#16** | **Elixir** | +% Hiệu quả của bình thuốc hồi sinh lực |
| **#17** | **Hero** | +% Điểm thuộc tính cốt lõi của nhân vật |
| **#18** | **Rebirth** | Tự động hồi sinh tại chỗ khi cạn máu (có thời gian hồi) |
| **#19** | **Time** | Kéo dài thời gian tác dụng của bùa lợi (*Buff Duration*) |
| **#20** | **Abyss** | Tăng % sát thương bóng tối và xuyên giáp |
| **#21** | **Protest** | Tăng khả năng kháng hiệu ứng làm choáng và đẩy lùi |
| **#22** | **Flight** | Tăng tốc độ bay của các tia đạn phép và mũi tên |
| **#23** | **Zenith** | Gia tăng sát thương tổng lực theo cấp độ hiện tại |
| **#24** | **Aether** | Tăng % sát thương nguyên tố Arcane |
| **#25** | **Chaos** | Ngẫu nhiên gây ra các vụ nổ nguyên tố hỗn loạn |
| **#26** | **Vigor** | Tăng % lượng Máu tối đa (*% Total HP*) |
| **#27** | **Spirit** | Tăng % lượng Mana tối đa (*% Total MP*) |
| **#28** | **Cure** | Tự động giải trừ toàn bộ hiệu ứng DoT khi trúng độc/cháy |
| **#29** | **Shield** | Tăng chỉ số Giáp vật lý (*Armor*) |
| **#30** | **Resist** | Tăng chỉ số Kháng tất cả (*All Resist*) |
| **#31** | **Strike** | Tăng % Tỷ lệ chí mạng (*Critical Chance*) |
| **#32** | **Ruin** | Tăng % Sát thương chí mạng (*Critical Damage*) |
| **#33** | **Force** | Tăng % Sát thương vũ khí (*Weapon Damage %*) |
| **#34** | **Power** | Tăng điểm Tấn công cơ bản (*Flat Power*) |
| **#35** | **Life** | Tăng tốc độ hồi máu tự động (*HP Regen*) |
| **#36** | **Mana** | Tăng tốc độ hồi năng lượng tự động (*MP Regen*) |
| **#37** | **Surge** | Hồi lại một lượng lớn Mana khi kết liễu kẻ thù |
| **#38** | **Drain** | Chuyển hóa sát thương gây ra thành lớp chắn ảo |
| **#39** | **Nova** | Cơ hội phóng ra sóng xung kích khi bị trúng đòn |
| **#40** | **Zod** | Viên đá tối thượng: Gia tăng toàn bộ chỉ số tổng thể |

---

## 11. BẢNG TỔNG HỢP CÔNG THỨC GHÉP ĐỒ ĐỎ (MYTHIC RECIPES)

| Tên Nội Tại Mythic | Vị Trí Trang Bị | Thứ Tự 4 Viên Mythstone Bắt Buộc | Tác Dụng Vận Hành |
| :--- | :--- | :--- | :--- |
| **CosmicOrb** | Vũ khí chính (MH) | `Gift` $\rightarrow$ `Wisdom` $\rightarrow$ `Clarity` $\rightarrow$ `Return` | Bắn ra quả cầu năng lượng tự động phóng tia gây 100% sát thương. |
| **Bombard** | Vũ khí chính (MH) | `Mentor` $\rightarrow$ `Endow` $\rightarrow$ `Death` $\rightarrow$ `Master` | Triệu hồi mưa thiên thạch oanh tạc liên tục toàn bộ sàn đấu. |
| **Apocalypse** | Vũ khí chính (MH) | `Hero` $\rightarrow$ `Protest` $\rightarrow$ `Endow` $\rightarrow$ `Quest` | Triệu hồi ngay lập tức 3 Fury rơi từ trên trời xuống đập nát mặt đất. |
| **Enigma** | Vũ khí phụ (OH) | `Haste` $\rightarrow$ `Quest` $\rightarrow$ `Fortune` $\rightarrow$ `Elixir` | Kỹ năng Teleport làm nứt vỡ sàn đấu, gây choáng toàn bộ quái. |
| **Brutal** | Áo giáp (Chest) | `Wisdom` $\rightarrow$ `Haste` $\rightarrow$ `Death` $\rightarrow$ `Master` | Đòn *Deadly Strike* gây $3\times$ sát thương bạo kích thay vì $2\times$. |
| **Skilled** | Áo giáp (Chest) | `Boon` $\rightarrow$ `Gift` $\rightarrow$ `Clarity` $\rightarrow$ `Haste` | Tăng trực tiếp 50% toàn bộ sát thương của kỹ năng tay chính. |
| **BloodMagic** | Mọi vị trí | `Hero` $\rightarrow$ `Gift` $\rightarrow$ `Endow` $\rightarrow$ `Master` | Resource Mythic: Bỏ Mana, xả skill bằng Máu; máu càng thấp sát thương càng cao. |
| **Equivalence** | Mọi vị trí | `Mentor` $\rightarrow$ `Protest` $\rightarrow$ `Wisdom` $\rightarrow$ `Death` | Resource Mythic: Cân bằng Max HP và Max MP (1:1), kích hoạt tối đa Set Equality. |
| **Energy** | Mọi vị trí | `Clarity` $\rightarrow$ `Abyss` $\rightarrow$ `Return` $\rightarrow$ `Wisdom` | Resource Mythic: Khóa năng lượng ở 100 điểm với tốc độ hồi cực nhanh. |
| **Fury** | Mọi vị trí | `Boon` $\rightarrow$ `Haste` $\rightarrow$ `Rebirth` $\rightarrow$ `Time` | Resource Mythic: Chuyển toàn bộ cơ chế tiêu hao tài nguyên sang hệ Nộ Khí. |
| **Hunter** | Nhẫn (Ring) | `Rebirth` $\rightarrow$ `Flight` $\rightarrow$ `Quest` $\rightarrow$ `Fortune` | Mỗi khi kích hoạt đền thờ (Shrine), luôn gọi ra 1–3 quái Epic để săn đồ. |
| **Adventure** | Dây chuyền (Amulet)| `Flight` $\rightarrow$ `Fortune` $\rightarrow$ `Quest` $\rightarrow$ `Zenith` | Nhận thêm điểm EXP tương đương với lượng tiền Vàng nhặt được trên sàn. |

---

## 12. BẢNG CHỈ SỐ TRẦN CỐT LÕI (STAT CAPS)

Việc tối ưu hóa trang bị ở tầng cao đòi hỏi không cộng lãng phí vượt quá các ngưỡng trần (*Hard Cap*) sau:

| Tên Chỉ Số | Tên Tiếng Anh | Ngưỡng Trần Tối Đa (Hard Cap) |
| :--- | :--- | :--- |
| **Kháng tất cả nguyên tố** | All Resist (AR) | **75%** (Mặc định) / **80%** (Tối đa qua hiệu ứng phụ) |
| **Né đòn** | Dodge Chance | **60%** (Cơ bản) / **75%** (Khi có Talent/Dexterity) |
| **Chặn đòn bằng khiên** | Block Chance | **60%** (Cơ bản) / **75%** (Khi dùng Shield Wall) |
| **Tỷ lệ bạo kích** | Critical Hit Chance | **60%** |
| **Sát thương bạo kích** | Critical Hit Damage | **350%** |
| **Tung chiêu miễn phí** | Clearcast Chance | **60%** (Cơ bản) / **75%** (Khi có Set Epiphany) |
| **Giảm thời gian hồi chiêu** | Cooldown Reduction | **50%** (Cơ bản) / **60%** (Khi có Set phụ trợ) |
| **Tốc độ tấn công** | Attack Speed | **+60%** |
| **Tốc độ di chuyển** | Movement Speed | **+60%** |
| **Tỷ lệ nhặt đồ hiếm** | Luck / Magic Find | **650%** |
| **Tỷ lệ nhặt vàng** | Gold Find | **650%** |
| **Tỷ lệ rơi vật phẩm** | Item Drop Rate | **200%** |