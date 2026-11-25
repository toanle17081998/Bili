# BÁCH KHOA TOÀN THƯ TOÀN DIỆN: DUNGEON QUEST (MOBILE)

> **Ghi chú sử dụng**: Tài liệu chuẩn hóa toàn bộ thuật ngữ tiếng Anh gốc trong *Dungeon Quest (Shiny Box Games)* kèm phân tích cơ chế hoạt động, công thức tính toán, vị trí trang bị, bảng tra cứu Crystals, Mythstones, Mythic Recipes, Talents của cả 3 Class, Set Affixes, ngưỡng trần chỉ số (*Hard Caps*) và lộ trình Build End-game.

---

## MỤC LỤC
1. [Hệ Thống 3 Lớp Nhân Vật (Classes) & Kho Vũ Khí (Main-Hand / Off-Hand)](#1-hệ-thống-3-lớp-nhân-vật-classes--kho-vũ-khí)
2. [Cấu Trúc Trang Bị, Phẩm Chất (Rarities) & Màu Sắc Thuộc Tính (Affixes)](#2-cấu-trúc-trang-bị-phẩm-chất--màu-sắc-thuộc-tính)
3. [Hệ Thống 10 Natures (Hậu Tố Tự Nhiên - Đá Beryl)](#3-hệ-thống-10-natures-hậu-tố-tự-nhiên---đá-beryl)
4. [Từ Điển Toàn Bộ 20 Loại Đá Pha Lê (Crystals) & Quy Trình Crafting](#4-từ-điển-toàn-bộ-20-loại-đá-pha-lê-crystals--quy-trình-crafting)
5. [Từ Điển Nhóm Chỉ Số Căn Bản, Epic, Legend & Crystal Affixes](#5-từ-điển-nhóm-chỉ-số-căn-bản-epic-legend--crystal-affixes)
   * [5.3. Bảng Tra Cứu Toàn Bộ 20 Dòng Crystal Affixes (Chữ Xanh Ngọc Cyan - Đá Obsidian)](#53-bảng-tra-cứu-toàn-bộ-20-dòng-crystal-affixes-chữ-xanh-ngọc-cyan---đá-obsidian)
   * [5.4. Các Dòng Legend Affixes Biến Đổi Kỹ Năng Độc Quyền (Reactor Orb, Balance...)](#54-các-dòng-legend-affixes-biến-đổi-kỹ-năng-độc-quyền-chữ-đỏcam---đá-ruby)
6. [Hệ Thống Talents Đầy Đủ Cho Cả 3 Class (Wizard, Warrior, Rogue)](#6-hệ-thống-talents-đầy-đủ-cho-cả-3-class)
7. [Nhóm Thuộc Tính Tree / Mastery Talents (+All Skills & +All Talents)](#7-nhóm-thuộc-tính-tree--mastery-talents)
8. [Hệ Thống 5 Nguyên Tố, Bạo Kích Nguyên Tố (Elemental Crit) & DoT](#8-hệ-thống-5-nguyên-tố-bạo-kích-nguyên-tố--dot)
9. [Hệ Thống Cơ Chế Kích Hoạt Tự Động (On-Hit Proc Mechanics)](#9-hệ-thống-cơ-chế-kích-hoạt-tự-động-on-hit-proc)
10. [Từ Điển Set Affixes Toàn Tập (Màu Xanh Lá)](#10-từ-điển-set-affixes-toàn-tập)
11. [Hệ Thống Resource Mythic (Quản Lý Tài Nguyên Độc Quyền)](#11-hệ-thống-resource-mythic-quản-lý-tài-nguyên)
12. [Bảng Tra Cứu Chuẩn 20 Loại Mythstones (Theo Vũ Khí / Giáp / Trang Sức)](#12-bảng-tra-cứu-chuẩn-20-loại-mythstones)
13. [Bảng Tổng Hợp Toàn Bộ Công Thức Ghép Đồ Mythic (Mythic Recipes)](#13-bảng-tổng-hợp-toàn-bộ-công-thức-ghép-đồ-mythic)
14. [Điểm Anh Hùng (Heroic Points), Chuyển Sinh (6 Ascension Perks) & Độ Khó](#14-điểm-anh-hùng-heroic-points-chuyển-sinh-6-ascension-perks--độ-khó)
15. [Hệ Thống Hireling (Bạn Đồng Hành), Pets, Trophies, Shrines & Battle Arena](#15-hệ-thống-hireling-pets-trophies-shrines--battle-arena)
16. [Bảng Chỉ Số Trần Cốt Lõi (Stat Caps) & Công Thức Giảm Thương](#16-bảng-chỉ-số-trần-cốt-lõi-stat-caps--công-thức-giảm-thương)
17. [Hướng Dẫn Phối Đồ Meta: Ultimate Farming Build & Climbing Floor 1000+](#17-hướng-dẫn-phối-đồ-meta-ultimate-farming-build--climbing-floor-1000)

---

## 1. HỆ THỐNG 3 LỚP NHÂN VẬT (CLASSES) & KHO VŨ KHÍ

Trong *Dungeon Quest*, nhân vật không có bảng kỹ năng chủ động cố định mà **4 nút kỹ năng chiến đấu (2 kỹ năng từ Vũ khí chính Main-Hand và 2 kỹ năng từ Vũ khí phụ Off-Hand)** được quyết định trực tiếp bởi loại vũ khí đang cầm. Đá **Aquamarine** dùng để đổi qua lại giữa các bộ kỹ năng của cùng một loại vũ khí.

### 1.1. Wizard (Pháp Sư - Sát Thương Phép Thuật / Spell Power)
* **Đặc trưng**: Tầm đánh xa, dọn quái diện rộng (AoE) mạnh nhất game, cơ chế phòng thủ bằng *Mana Shield* và triệu hồi đệ (*Skull / Minions*).
* **Vũ khí chính (Main-Hand - MH)**:
  1. **Wand (Đũa phép)**: Tốc độ bắn nhanh, tầm xa. Kỹ năng: *Barrage* (Bắn chùm tia) / *Storm* (Bão nguyên tố) / *Orb*.
  2. **Staff (Trượng phép)**: Sát thương cơ bản cao, diện rộng lớn. Kỹ năng: *Comet* (Thiên thạch băng) / *Meteor* (Mưa thiên thạch).
  3. **Gauntlet (Găng phép)**: Tốc độ đánh rất nhanh, tầm trung. Kỹ năng: *Blast* (Chưởng nổ) / *Twister* (Lốc xoáy).
  4. **Sword (Kiếm phép)**: Đánh tầm gần/trung kết hợp phóng kiếm khí. Kỹ năng: *Pierce* (Đâm xuyên) / *Orb* (Quả cầu năng lượng).
* **Vũ khí phụ (Off-Hand - OH)**:
  1. **Orb (Cầu phép)**: Cơ động và khống chế. Kỹ năng: *Teleport* (Dịch chuyển tức thời) / *Shatter* (Nổ mảnh băng/nguyên tố).
  2. **Tome (Sách phép)**: Phòng thủ và làm chậm thời gian. Kỹ năng: *ManaShield* (Khiên năng lượng) / *TimeWarp* (Bóp méo không-thời gian).
  3. **Skull (Đầu lâu)**: Triệu hồi và tạo giáp xương. Kỹ năng: *SkullShield* (Khiên đầu lâu xoay quanh người) / *Skulldraga* (Rồng xương) / *Command*.
  4. **Mirror / Totem (Gương / Cọc phép)**: Phân thân và hỗ trợ diện rộng. Kỹ năng: *MirrorImage* / *Recall*.

### 1.2. Warrior (Chiến Binh - Sát Thương Vật Lý / Physical Power)
* **Đặc trưng**: Cận chiến siêu trâu bò, khả năng hút quái (*Taunt*), lướt xuyên địa hình (*Charge*), xoay vũ khí (*Whirlwind*) và chắn đòn (*Block*).
* **Vũ khí chính (Main-Hand - MH)**:
  1. **Hammer (Búa tạ)**: Sát thương gốc (Base DMG: ~75) cao nhất game, tốc độ chậm, nổ AoE lớn. Kỹ năng: *Smash* / *Earthshatter*.
  2. **Axe (Rìu chiến)**: Cân bằng giữa tốc độ và sát thương, mạnh về gây chảy máu (*Bleed*). Kỹ năng: *Cleave* / *Whirlwind* (Xoay rìu) / *ThrowAxe*.
  3. **Sword (Đại kiếm)**: Tốc độ chém nhanh, tỷ lệ chí mạng cao. Kỹ năng: *Slash* / *Flurry* / *Torrent*.
  4. **Lance (Thương dài)**: Tầm đánh cận chiến xa, mạnh về đâm xuyên (*Pierce*) và lướt. Kỹ năng: *Impale* / *Charge* (Lướt tông thẳng).
* **Vũ khí phụ (Off-Hand - OH)**:
  1. **Shield (Khiên chắn)**: Tăng mạnh Armor và Block Chance. Kỹ năng: *ShieldWall* (Tăng trần Block lên 75%) / *ShieldBash* / *Charge*.
  2. **Hatchet (Rìu phụ)**: Tăng tốc độ chém song thủ và sát thương chảy máu. Kỹ năng: *Scalp* / *Whirlwind*.
  3. **Horn (Tù và chiến trận)**: Buff chỉ số và gom quái. Kỹ năng: *Taunt* (Khiêu khích hút quái) / *BattleCry* (Hú tăng DMG và tốc đánh).
  4. **Claw / Gauntlet (Vuốt sắt)**: Đánh cận chiến tốc độ cao kèm *Leap* (Nhảy giẫm làm choáng).

### 1.3. Rogue (Sát Thủ & Xạ Thủ - Sát Thương Vật Lý & Độc/Nguyên Tố)
* **Đặc trưng**: Tốc độ di chuyển và tốc độ đánh cao nhất game, cơ chế đạn nảy (*Ricochet*), tàng hình (*Stealth*), đặt bẫy (*Traps*) và né đòn (*Dodge*).
* **Vũ khí chính (Main-Hand - MH)**:
  1. **Flintlock / Pistol (Súng lục)**: Vũ khí cày đồ (Farming) số 1 của Rogue. Tốc độ bắn cực nhanh, đạn tự nảy giữa các mục tiêu (*Ricochet*). Kỹ năng: *QuickShot* / *Ricochet* / *ScatterShot* / *Barrage*.
  2. **Chakram (Vòng nguyệt quế)**: Vũ khí có Base DMG cao nhất của Rogue (~60), ném xuyên thấu toàn bộ quái trên đường bay và quay về. Kỹ năng: *Boomerang* / *WhirlingBlades*.
  3. **Bow (Cung tên)**: Tầm bắn xa nhất, bắn tia hình nón hoặc mưa tên. Kỹ năng: *MultiShot* / *GuidedShot* / *RainOfArrows*.
  4. **Dagger (Dao găm)**: Cận chiến tốc độ siêu thanh, bạo kích cực đại. Kỹ năng: *Slice* / *BlinkStrike* (Ám sát dịch chuyển) / *FanOfKnives*.
* **Vũ khí phụ (Off-Hand - OH)**:
  1. **Trap / Bomb (Bẫy & Bom)**: Kiểm soát bản đồ. Kỹ năng: *SmokeBomb* (Bom khói giảm kháng địch) / *Sentry* (Trụ bắn tự động) / *BearTrap*.
  2. **Quiver (Ống tên)**: Hỗ trợ cung/súng. Kỹ năng: *Vault* (Nhào lộn thoát thân) / *RapidFire*.
  3. **Off-Hand Dagger (Dao phụ)**: Kỹ năng: *Stealth* (Tàng hình tăng 100% Crit đòn đầu) / *ShadowStep*.
  4. **Sub-Flintlock (Súng phụ)**: Bắn kết hợp song súng tăng gấp đôi mật độ đạn kích hoạt Proc.

---

## 2. CẤU TRÚC TRANG BỊ, PHẨM CHẤT & MÀU SẮC THUỘC TÍNH

### 2.1. Cấu Trúc 6 Món Trang Bị
Một nhân vật trang bị 6 món chính: **Main-Hand (MH)**, **Off-Hand (OH)**, **Chest (Áo giáp)**, **Head (Mũ)**, **Ring (Nhẫn)**, **Amulet (Dây chuyền)**, cùng với **1 Pet (Thú cưng)** và **1 Trophy (Cúp danh hiệu)**.
Mỗi món trang bị chính có:
* Chỉ số gốc (**Base Stats**), Phẩm chất (**Quality**: tối đa `+25%`), Cấp độ trang bị (**Item Level**: tối đa `100`), Nguyên tố (**Element**).
* **1 dòng Nature** (Hậu tố ẩn) + **1 dòng Talent** (Trên Áo, Mũ, Nhẫn, Dây chuyền).
* Tối đa **6 dòng Affixes chính** (Bao gồm tối đa 1 dòng *Crystal Affix*, 1 dòng *Set Affix*, các dòng *Legend/Epic Affix*) + **4 lỗ cắm (Sockets)** (Hoặc 1 dòng *Mythic Affix* sau khi khảm 4 viên Mythstone).

### 2.2. Hệ Thống 8 Cấp Độ Phẩm Chất Vật Phẩm (Rarity Tiers)
1. **Normal (Trắng)**: Đồ cơ bản, không có dòng thuộc tính phụ.
2. **Magic (Xanh lá nhạt / Xanh dương)**: Có 1–2 dòng Normal Affix.
3. **Rare (Vàng)**: Có 3–4 dòng Normal Affix.
4. **Epic (Tím nhạt)**: Có 4–5 dòng thuộc tính, xuất hiện các dòng **Epic Affix** chỉ số cao.
5. **Legend (Đỏ / Cam đậm)**: Sở hữu các dòng **Legend Affix** độc quyền thay đổi cơ chế kỹ năng và đôi khi đi kèm sẵn **Set Affix**.
6. **Mythic (Tím Đậm)**: **Không rơi tự nhiên**. Được tạo thành khi khảm đúng thứ tự 4 viên **Mythstone** vào trang bị có 4 lỗ cắm.
7. **Eternal (Xanh Lục Bảo - Emerald)**: Trang bị quý hiếm nhất rơi tự nhiên ở độ khó cao.
   * **Đặc quyền 1**: Mọi dòng chỉ số Normal, Epic, Legend và **Set Affix** trên đồ Eternal đều được **nhân 1.5x đến 2x giá trị** (Đặc biệt: 1 món Eternal mang dòng Set tính bằng **2 Rank Set**!).
   * **Đặc quyền 2 (Giới hạn Crafting)**: Đồ Eternal **KHÔNG THỂ** dùng phần lớn đá Crystal để tẩy/thêm dòng (như Ruby, Amethyst, Obsidian, Kyanite, Zircon...). Bạn **chỉ có thể** dùng **Calcite** (đổi nguyên tố), **Jasper** (đổi Class), **Emerald** (tăng Quality) và **Beryl** (đổi Nature) trên đồ Eternal.
8. **Eternal Mythic**: Khi một món đồ Eternal rơi tự nhiên **có sẵn 4 lỗ cắm (4 Sockets)**, người chơi khảm 4 viên Mythstone vào sẽ tạo ra **Eternal Mythic** (vừa nhân đôi sức mạnh dòng chỉ số/Set, vừa sở hữu nội tại Mythic).

### 2.3. Ý Nghĩa Màu Sắc Dòng Thuộc Tính (Affix Colors)
* **Chữ Trắng (Base Stats)**: Sát thương gốc vũ khí, Giáp gốc, Tốc độ đánh cơ bản.
* **Chữ Xanh Lá Nhạt (Nature / Talent)**: Dòng nội tại phụ của trang bị (chỉnh bằng đá *Beryl* và *Citrine*).
* **Chữ Vàng / Trắng (Normal Affixes)**: Dòng chỉ số phụ bậc thấp (chỉnh bằng đá *Larimar*).
* **Chữ Tím (Epic Affixes)**: Dòng chỉ số bậc cao (chỉnh bằng *Fluorite*, *Topaz*, *Garnet*).
* **Chữ Đỏ / Cam (Legend Affixes)**: Dòng thuộc tính Huyền thoại (thêm bằng *Ruby*, nâng cấp từ Epic bằng *Sapphire*, đảo dòng bằng *Diamond*).
* **Chữ Xanh Ngọc / Cyan (Crystal Affixes)**: Dòng chỉ số siêu cấp ở trên cùng trang bị, có giá trị **gấp 2.5x – 3x dòng Epic** (tạo ra bằng đá *Obsidian*, mỗi món tối đa 1 dòng).
* **Chữ Xanh Lá Đậm (Set Affixes)**: Dòng kích hoạt bộ trang bị (thêm/đổi bằng đá *Amethyst* đối với các Set thường).
* **Chữ Tím Đậm (Mythic Affixes)**: Dòng nội tại Thần thoại xuất hiện sau khi ghép đủ 4 viên Mythstone.

---

## 3. HỆ THỐNG 10 NATURES (HẬU TỐ TỰ NHIÊN - ĐÁ BERYL)

Mỗi trang bị đều có một hậu tố ẩn dạng `"Tên Trang Bị of [Nature]"` (Ví dụ: *Wand of Luck*). Dùng đá **Beryl** để xoay ngẫu nhiên sang 1 trong 10 loại Nature sau:

| Tên Nature | Chỉ Số Cộng Thêm | Giá Trị Cố Định | Khuyên Dùng Cho Bản Build |
| :--- | :--- | :---: | :--- |
| **of Luck** | Tăng May mắn (*Luck*) | **+25%** | Bản Build Cày Đồ (Farming) |
| **of Greed** | Tăng Vàng rơi ra (*Gold Find*) | **+25%** | Bản Build Cày Đồ (Farming) |
| **of Strength** | Tăng Sát thương chí mạng (*Crit Damage*) | **+10%** | Mọi bản Build Tấn Công / Leo Tầng |
| **of Death** | Tăng Tỷ lệ chí mạng (*Crit Chance*) | **+2.5%** | Khi chưa đạt trần 60% Crit Chance |
| **of Elements** | Tăng Sát thương nguyên tố (*Elemental DMG*) | **+5%** | Mọi bản Build Tấn Công Nguyên Tố |
| **of Haste** | Tăng Tốc độ tấn công (*Attack Speed*) | **+2.5%** | Khi chưa đạt trần 60% Attack Speed |
| **of Wisdom** | Giảm tiêu hao năng lượng (*Resource Cost*) | **-10%** | Các Build tốn nhiều Mana / Fury |
| **of Evasion** | Tăng Tỷ lệ né đòn (*Dodge Chance*) | **+1.5%** | Build Phòng thủ / Leo Tầng Cao |
| **of Blessed** | Tăng Kháng tất cả (*All Resist*) | **+15** | Khi chưa đạt trần 75% All Resist |
| **of Protection** | Tăng Giáp vật lý (*Armor*) | **+15** | Đầu game (Early-game) |

---

## 4. TỪ ĐIỂN TOÀN BỘ 20 LOẠI ĐÁ PHA LÊ (CRYSTALS) & QUY TRÌNH CRAFTING

### 4.1. Bảng Tra Cứu 20 Loại Crystals (Theo Thứ Tự Cấp Bậc Ghép 2:1)
Bạn có thể ghép **2 viên Crystal cùng bậc** để tạo thành **1 viên Crystal bậc kế tiếp** (Convert), hoặc phân tách (**Salvage**) trang bị Legend/Crystal để thu hồi đá:

| Thứ Tự | Tên Đá Crystal | Tác Dụng Chính Xác Khi Sử Dụng Lên Trang Bị | Dùng Được Trên Đồ Eternal? |
| :---: | :--- | :--- | :---: |
| **#1** | **Calcite** | Đổi **Nguyên tố (Element)** của Trang bị, Pet hoặc Trophy sang 1 trong 5 hệ bạn chọn. | **CÓ** |
| **#2** | **Beryl** | Đổi ngẫu nhiên dòng **Nature** (1 trong 10 loại ở Mục 3). | **CÓ** |
| **#3** | **Citrine** | Đổi ngẫu nhiên dòng **Talent** trên Áo, Mũ, Nhẫn, Dây chuyền (theo đúng Class của món đồ). | Không |
| **#4** | **Larimar** | Thêm 1 dòng **Normal Affix** (nếu còn chỗ trống) hoặc đổi ngẫu nhiên tất cả dòng Normal Affix. | Không |
| **#5** | **Kyanite** | **Xóa chính xác 1 dòng chỉ số** (Normal, Epic, Legend hoặc Set) do bạn chỉ định khỏi trang bị. | Không |
| **#6** | **Quartz** | Xóa ngẫu nhiên từ 1 đến tất cả các dòng chỉ số trên trang bị (dùng để tẩy trắng phôi). | Không |
| **#7** | **Zircon** | Đục thêm **+1 lỗ cắm (Socket)** lên trang bị (Tối đa 4 lỗ). | Không |
| **#8** | **Fluorite** | Nâng cấp 1 dòng Normal Affix thành **Epic Affix**, hoặc tăng chỉ số dòng Epic lên kịch trần (**Max Roll**). | Không |
| **#9** | **Aquamarine** | Đổi **Kỹ năng vũ khí (Weapon Skill / Special)** sang kỹ năng khác của cùng loại vũ khí đó. | Không |
| **#10** | **Garnet** | Xoay (Reroll) lại ngẫu nhiên toàn bộ các dòng Normal và Epic trên trang bị. | Không |
| **#11** | **Amethyst** | Thêm 1 dòng **Set Affix (Chữ Xanh Lá)** vào chỗ trống, hoặc đổi dòng Set hiện tại sang Set khác. | Không |
| **#12** | **Peridot** | Tăng giá trị (**Roll Value**) của 1 dòng chỉ số bất kỳ do bạn chọn (dùng để đẩy dòng **Legend** và **Crystal Affix** lên Max chỉ số!). | Không |
| **#13** | **Topaz** | Cho phép bạn chọn 1 dòng Epic trên đồ và đổi nó sang 1 dòng Epic khác từ danh sách 3 lựa chọn. | Không |
| **#14** | **Emerald** | Tăng **+1% Quality (Chất lượng)** cho trang bị (Tối đa **+25% Quality**, giúp tăng Base DMG và Base Armor). | **CÓ** |
| **#15** | **Pearl** | Nâng cấp độ trang bị (**Item Level**) lên thẳng **Level 100** (giúp mở khóa ngưỡng chỉ số cao nhất). | Không |
| **#16** | **Sapphire** | Nâng cấp 1 dòng **Epic Affix** do bạn chọn lên thành dòng **Legend Affix** tương ứng. | Không |
| **#17** | **Ruby** | Thêm 1 dòng **Legend Affix (Chữ Đỏ/Cam)** vào chỗ trống trên trang bị (cho phép chọn 1 trong 3 dòng gợi ý). | Không |
| **#18** | **Diamond** | Xoay (Reroll) lại tất cả các dòng Epic và Legend trên trang bị (Giữ nguyên dòng Set, Crystal và Mythic). | Không |
| **#19** | **Jasper** | **Chuyển đổi Class (Hệ nhân vật)** của trang bị sang Class bạn đang chơi! *(Mẹo: Giữ nguyên Vũ khí/Kỹ năng hoặc đổi dòng Class Mastery sang Class mới).* | **CÓ** |
| **#20** | **Obsidian** | Thêm 1 dòng **Crystal Affix (Chữ Xanh Ngọc - mạnh gấp 3 lần)** lên trang bị (cho chọn 1 trong 3 dòng gợi ý). | Không |

### 4.2. Quy Trình 7 Bước Chế Tạo Trang Bị End-Game Chuẩn (Standard Crafting Loop)
1. **Bước 1 (Chuẩn bị phôi)**: Chọn món đồ đúng loại vũ khí/giáp bạn cần. Nếu chưa đạt Lv.100, dùng **Pearl** nâng lên Lv.100. Dùng **Emerald** đập kịch trần **+25% Quality**.
2. **Bước 2 (Đục lỗ)**: Dùng **Zircon** đục đủ **4 Sockets (4 lỗ)**.
3. **Bước 3 (Dọn phôi)**: Dùng **Kyanite** (hoặc **Quartz**) xóa sạch các dòng chỉ số rác không mong muốn.
4. **Bước 4 (Ép dòng Crystal - Quan trọng nhất)**: Dùng **Obsidian** để gắn dòng **Crystal Affix (Cyan)** mong muốn. Dùng **Peridot** đập dòng Crystal đó lên chỉ số tối đa (Max Roll).
5. **Bước 5 (Ép dòng Set)**: Dùng **Amethyst** xoay cho ra đúng dòng **Set Affix (Xanh lá)** của bản Build, sau đó dùng **Peridot** đẩy lên **Rank 5** (Max Rank trên 1 món đồ thường).
6. **Bước 6 (Điền đầy các dòng Legend & Epic)**:
   * Dùng **Ruby** (hoặc dùng **Topaz** chọn dòng Epic rồi lấy **Sapphire** nâng lên Legend) để lấy chính xác từng dòng **Legend Affix** và **Epic Affix** còn thiếu.
   * Dùng **Fluorite** (cho dòng Epic) và **Peridot** (cho dòng Legend) để nâng toàn bộ các dòng đạt **100% Max Value**.
   * Dùng **Calcite** chỉnh đúng Nguyên tố, **Beryl** chỉnh đúng Nature, **Citrine** chỉnh đúng Talent (và **Aquamarine** chỉnh đúng Skill nếu là Vũ khí).
7. **Bước 7 (Khảm Mythic)**: Gắn lần lượt 4 viên **Mythstone** theo đúng thứ tự từ trái sang phải (hoặc từ trên xuống dưới) để kích hoạt dòng **Mythic Affix**.

---

## 5. TỪ ĐIỂN NHÓM CHỈ SỐ CĂN BẢN, EPIC, LEGEND & CRYSTAL AFFIXES

### 5.1. Nhóm Chỉ Số Tấn Công (Offensive Affixes)
* **Weapon Damage + (Flat WD)**: Cộng thẳng điểm sát thương cơ bản vào vũ khí trước khi nhân các hệ số %. (Ví dụ: `+500 Weapon DMG` trên Epic, `+1500 Weapon DMG` trên Crystal Affix).
* **Weapon Damage % (WD%)**: Tăng % sát thương của vũ khí đang cầm (`+50%` Epic, `+100%` Legend, `+150%` Crystal). *Lưu ý: Chỉ có tác dụng tốt nhất khi ép trực tiếp trên chính vũ khí đó.*
* **Power (Flat / %)**: Tăng chỉ số Sức mạnh tấn công nền tảng cho mọi kỹ năng.
* **Elemental Damage % (ED%)**: Tăng % sát thương cho nguyên tố tương ứng (Fire, Ice, Shock, Poison, Arcane).
* **Attack Speed (AS%)**: Tăng tốc độ ra đòn và giảm thời gian hoạt ảnh kỹ năng (**Hard Cap: +60%**).
* **Critical Chance (Crit%)**: Tỷ lệ đòn đánh gây bạo kích (**Hard Cap: 60%**).
* **Critical Damage (Crit DMG%)**: Hệ số nhân sát thương khi bạo kích (**Hard Cap: +350%**).
* **Deadly Strike**: Tỷ lệ khi đã bạo kích sẽ gây **gấp đôi (2x)** sát thương bạo kích (hoặc **3x** nếu mặc áo Mythic *Brutal*).
* **Crushing Blow (CB%)**: Tỷ lệ đòn đánh lấy đi trực tiếp **25% lượng Máu hiện tại (Current HP)** của quái vật thường (giảm tỷ lệ lên Boss/Elite nhưng vẫn là chỉ số bắt buộc để gọt máu quái ở Floor 1000+).
* **Multi Attack (+X)**: Mỗi điểm cộng thêm 1 đòn đánh phụ gây **50% sát thương** (Tối đa `+2` trên Legend, `+4` trên Crystal).
* **Extra Attack Chance (+X)**: Mỗi điểm cộng thêm cơ hội tung ra 1 đòn đánh phụ gây **100% sát thương**.
* **Pierce Chance**: Tỷ lệ đạn/đòn đánh xuyên qua mục tiêu đầu tiên để trúng các mục tiêu phía sau (Kết hợp với áo Mythic *Exposed* tăng 50% DMG).
* **Bleed Chance / Bleed DMG**: Tỷ lệ gây chảy máu vật lý theo thời gian (Kết hợp với áo Mythic *Ruptured* tăng 50% DMG).
* **Elemental Crit Chance / DMG**: Tỷ lệ và sát thương của hiệu ứng **Bạo kích Nguyên tố** (Khác với Crit vật lý thông thường).
* **Weaken (`+X%`)**: Khiến kẻ địch trúng đòn bị giảm kháng và nhận thêm `%` sát thương từ mọi nguồn.
* **Ignore Resist**: Bỏ qua hoàn toàn kháng nguyên tố của quái vật (*Lưu ý: Không hoạt động cộng dồn với hiệu ứng âm kháng của Weaken/Ascendant*).
* **AoE Range / Size**: Mở rộng bán kính vùng nổ của các chiêu diện rộng.

### 5.2. Nhóm Chỉ Số Phòng Thủ & Quản Lý Tài Nguyên (Defensive & Utility)
* **All Resist (AR)**: Điểm kháng toàn bộ 5 nguyên tố. Công thức giảm thương hiển thị dưới dạng `%` (**Hard Cap: 75%**, tối đa **80%** khi có hiệu ứng nâng trần).
* **Elemental Resist (Fire/Ice/Shock/Poison/Arcane Resist)**: Kháng đơn nguyên tố (Dùng kết hợp với nhẫn Mythic **Unity** giúp đồng bộ toàn bộ kháng theo nguyên tố cao nhất!).
* **Armor (Flat / %)**: Giáp giảm sát thương vật lý trực tiếp.
* **Total HP % / Flat HP**: Tăng lượng máu tối đa.
* **Total MP % / Flat MP**: Tăng lượng năng lượng tối đa.
* **Dodge Chance**: Tỷ lệ né hoàn toàn đòn đánh của địch (**Cap cơ bản: 60%**, lên **75%** với Talent/Set).
* **Block Chance**: Tỷ lệ đỡ đòn bằng Khiên, giảm mạnh sát thương nhận vào (**Cap cơ bản: 60%**, lên **75%** khi bật *ShieldWall*).
* **HP on Hit / MP on Hit (Leech)**: Hồi máu/mana trực tiếp trên mỗi lần đòn đánh chạm mục tiêu.
* **HP Regen / MP Regen**: Lượng máu/mana tự hồi mỗi giây.
* **Clearcast**: Tỷ lệ tung kỹ năng tốn **0 Mana/Resource** (**Cap cơ bản: 60%**, lên **75%** với Set *Epiphany*).
* **Reduce Cost (Resource Cost Reduction)**: Giảm `%` năng lượng tiêu hao của mọi kỹ năng (**Cap: 60%**).
* **Cooldown Reduction (CDR)**: Giảm thời gian hồi chiêu (**Cap: 60%**).
* **Move Speed**: Tăng tốc độ chạy (**Cap: +60%**).

### 5.3. Bảng Tra Cứu Toàn Bộ 20 Dòng Crystal Affixes (Chữ Xanh Ngọc Cyan - Đá Obsidian)
Dòng **Crystal Affix (Màu Xanh Ngọc)** là thuộc tính nằm trên đỉnh trang bị, mang giá trị **gấp 2.5x đến 3x so với dòng Epic tương ứng**. Mỗi trang bị chỉ mang tối đa 1 dòng Crystal Affix (tạo ra ngẫu nhiên bằng đá **Obsidian #20** và nâng Max Roll bằng **Peridot #12**):

| Tên Dòng Crystal Affix (Cyan) | Mô Tả Tác Dụng Vận Hành | Giá Trị Min | Giá Trị Max Roll (Cực Đại) |
| :--- | :--- | :---: | :---: |
| **Crystal Attack Speed** | Tăng mạnh tốc độ xuất chiêu và tốc độ đánh cơ bản | `+2.5%` | **`+45%`** |
| **Crystal Reduced Cost** | Giảm % lượng Mana/Resource tiêu hao của mọi kỹ năng | `-2.5%` | **`-45%`** |
| **Crystal Reduced CD** | Giảm % thời gian hồi chiêu (Cooldown Reduction) | `-2.5%` | **`-45%`** |
| **Crystal Crit Chance** | Tăng trực tiếp % tỷ lệ bạo kích đòn đánh | `+2.5%` | **`+45%`** |
| **Crystal Crit Damage** | Tăng siêu lớn % sát thương bạo kích khi nổ Crit | `+10%` | **`+225%`** |
| **Crystal Crushing Blow** | Tỷ lệ lấy đi ngay lập tức **25% Máu hiện tại** của quái | `+2.5%` | **`+30%`** |
| **Crystal Deadly Strike** | Tỷ lệ đòn đánh gây sát thương gấp đôi/gấp ba bạo kích | `+2.5%` | **`+30%`** |
| **Crystal Dodge** | Tăng trực tiếp % tỷ lệ né tránh hoàn toàn đòn đánh | `+2.5%` | **`+30%`** |
| **Crystal Block** | Tăng trực tiếp % tỷ lệ đỡ đòn bằng Khiên (Shield) | `+2.5%` | **`+45%`** |
| **Crystal Weaken** | Tỷ lệ giảm trừ tới **50% Kháng** của kẻ địch khi trúng đòn | `+2.5%` | **`+90%`** |
| **Crystal All Resist** | Tăng một lượng điểm Kháng toàn bộ 5 nguyên tố cực lớn | `+10` | **`+750 All Resist`** |
| **Crystal Armor** | Tăng chỉ số Giáp vật lý khổng lồ cho trang bị phòng thủ | `+250` | **`+7,500 Armor`** |
| **Crystal Total HP** | Tăng thẳng % lượng Máu tối đa của nhân vật | `+5%` | **`+75% Total HP`** |
| **Crystal Total MP** | Tăng thẳng % lượng Mana tối đa của nhân vật | `+5%` | **`+75% Total MP`** |
| **Crystal HP Regen** | Hồi phục một lượng Máu lớn mỗi 5 giây | `+50` | **`+1,500 HP Regen`** |
| **Crystal MP Regen** | Hồi phục một lượng Mana lớn mỗi 5 giây | `+50` | **`+1,500 MP Regen`** |
| **Crystal HP Leech / Hit** | Hồi máu trực tiếp trên mỗi đòn đánh chạm mục tiêu | `+5` | **`+500 HP on Hit`** |
| **Crystal MP Leech / Hit** | Hồi mana trực tiếp trên mỗi đòn đánh chạm mục tiêu | `+5` | **`+500 MP on Hit`** |
| **Crystal Gold Find** | Tăng % Vàng rơi ra từ quái (Bắt buộc cho Farming Build) | `+5%` | **`+225% Gold Find`** |
| **Crystal Luck** | Tăng % tỉ lệ rơi đồ hiếm (Bắt buộc cho Farming Build) | `+5%` | **`+225% Luck`** |

### 5.4. Các Dòng Legend Affixes Biến Đổi Kỹ Năng Độc Quyền (Chữ Đỏ/Cam - Đá Ruby)
Các dòng Legend đặc biệt biến đổi bản chất của kỹ năng vũ khí hoặc chỉ số nội tại chuyên biệt:
* **Balance**: Tăng đồng loạt cả **Total HP %** và **Total MP %** dựa trên độ cân bằng (ví dụ: `+77.9% Balance` trên dây chuyền *Unity*).
* **Reactor (Arc-Like Orb)**: *"Gives Orb a +12% to +100% MH arc-like effect every 0.5s that reaches enemies within +3 yards, increased by your AoE Range value"* $\rightarrow$ Quả cầu Orb cứ mỗi 0.5 giây tự động phóng tia sét hồ quang quét sạch quái xung quanh đường bay trong bán kính 3 yards (mở rộng theo chỉ số AoE Range).
* **Flurry**: Tăng `+50%` hệ số tốc độ chém liên hoàn cho Warrior.
* **Whirlwind**: Xoay vũ khí càn quét liên tục, gây % Weapon DMG diện rộng cho tất cả kẻ địch trong tầm quét.
* **Ricochet**: Đạn súng lục/Flintlock của Rogue nảy giữa các mục tiêu hoặc nảy từ tường ra tối đa 4 lần.
* **Meteor / Comet**: Tự động gọi thiên thạch lửa hoặc sao băng gây sát thương diện rộng và khống chế quái vật.
* **Multi Attack (`+1` đến `+4`)**: Đòn đánh tung thêm các đòn phụ gây 50% sát thương, giúp kích hoạt dồn dập các hiệu ứng Proc và bạo kích.

---

## 6. HỆ THỐNG TALENTS ĐẦY ĐỦ CHO CẢ 3 CLASS

**Talents** là dòng nội tại cố định trên 4 món trang bị phòng thủ & trang sức (**Chest, Head, Ring, Amulet**), mở khóa theo cấp độ vật phẩm (Chest Lv.6+, Head Lv.11+, Ring Lv.16+, Amulet Lv.21+). Dùng đá **Citrine** để xoay dòng Talent.
Trên mỗi món đồ, Talent có cấp gốc từ `1–10` (và được cộng thêm hàng chục cấp nhờ các dòng `+All Skills / +All Talents / Elixir Mythstone`).

### 6.1. Bảng Talents Của WIZARD (Pháp Sư)

| Vị Trí | Tên Talent | Nhánh Chuyên Môn | Hiệu Ứng Mỗi Rank (Cấp) |
| :--- | :--- | :--- | :--- |
| **Chest (Áo)** | **Sorcery** | Elementalist | Tăng `+5%` hiệu quả của các hiệu ứng nguyên tố (Element Effect). |
| **Chest (Áo)** | **Cosmic** | Elementalist | Tăng `+10` điểm Kháng tất cả (All Resist) mỗi rank. |
| **Chest (Áo)** | **Barrier** | Arch Mage | Giảm `-1.5%` lượng MP tiêu thụ khi khiên *ManaShield* hấp thụ sát thương. |
| **Chest (Áo)** | **Focus** | Arch Mage | Tăng `+2%` Sát thương Vũ khí (Weapon DMG) mỗi rank. |
| **Chest (Áo)** | **Necrotic** | Spiritmancer | Tăng `+2.5%` sát thương của các kỹ năng hệ Đầu lâu (Skull DMG). |
| **Chest (Áo)** | **Prowess** | Spiritmancer | Tăng `+2.5%` sát thương đòn đánh của Đệ tử triệu hồi (Minion DMG). |
| **Head (Mũ)** | **Wizardry** | Elementalist | Tăng `+1%` Tỷ lệ Bạo kích Nguyên tố (Elemental Crit Chance) mỗi rank. |
| **Head (Mũ)** | **Amplify** | Elementalist | Tăng `+5%` tổng sát thương cho mỗi hiệu ứng nguyên tố đang dính trên mục tiêu. |
| **Head (Mũ)** | **Insight** | Arch Mage | Tăng `+1%` Dodge và hồi lại `%` MP mỗi khi né đòn thành công. |
| **Head (Mũ)** | **Backfire** | Arch Mage | Khiên *ManaShield* phản lại `+10%` sát thương vào kẻ tấn công mỗi rank. |
| **Head (Mũ)** | **Infusion** | Arch Mage | Cho phép khiên *ManaShield* hưởng chỉ số giảm thương từ All Resist. |
| **Head (Mũ)** | **Boost** | Spiritmancer | Tăng `+1%` tốc độ chạy và tốc độ đánh cho Minion mỗi rank. |
| **Head (Mũ)** | **Hearty** | Spiritmancer | Tăng `+1.5%` Máu tối đa (Max HP) cho Minion mỗi rank. |
| **Ring (Nhẫn)** | **Astral** | Elementalist | Tăng Elemental DMG dựa trên `+0.2%` tổng điểm All Resist mỗi rank. |
| **Ring (Nhẫn)** | **Magnify** | Arch Mage | Tăng `+0.2%` bán kính diện rộng (AoE Range) mỗi rank. |
| **Ring (Nhẫn)** | **Continuity** | Arch Mage | Kỹ năng *TimeWarp* làm chậm thêm `+2.5%` tốc độ đánh của quái mỗi rank. |
| **Ring (Nhẫn)** | **Bewilder** | Elementalist | Các đòn bắn (Projectiles) có thêm `+1.5%` tỷ lệ làm choáng (Stun) mỗi rank. |
| **Ring (Nhẫn)** | **Diffusion** | Spiritmancer | Chuyển `+2.5%` sát thương người chơi nhận vào sang cho Minion gánh hộ. |
| **Ring (Nhẫn)** | **Spiritual** | Spiritmancer | Tăng `+1%` tốc độ hồi máu tự nhiên cho Minion mỗi rank. |
| **Amulet (Cổ)** | **Prismatic** | Elementalist | Có `+2.5%` tỷ lệ đòn đánh gây thêm hiệu ứng của nguyên tố ngẫu nhiên khác. |
| **Amulet (Cổ)** | **Fester** | Elementalist | Kéo dài thêm `+2.5%` thời gian tác dụng của hiệu ứng nguyên tố (DoT/Freeze). |
| **Amulet (Cổ)** | **Mastery** | Arch Mage | Giảm thời gian hồi chiêu (`+0.5%` Cooldown Reduction) mỗi rank. |
| **Amulet (Cổ)** | **Empower** | Arch Mage | Tăng `+2.5%` Power nhưng giảm `-2.5%` Max HP mỗi rank (Tối ưu sát thương). |
| **Amulet (Cổ)** | **Reclaim** | Spiritmancer | Có `+1%` tỷ lệ tự động bật *SkullShield* khi tung chiêu mỗi rank. |
| **Amulet (Cổ)** | **Recall** | Spiritmancer | Có `+1%` tỷ lệ tự động triệu hồi thêm Minion khi tấn công mỗi rank. |

### 6.2. Bảng Talents Của WARRIOR (Chiến Binh)

| Vị Trí / Nhóm | Tên Talent | Nhánh Chuyên Môn | Hiệu Ứng Mỗi Rank (Cấp) |
| :--- | :--- | :--- | :--- |
| **Chest / Head** | **Might** | Champion | Tăng `+%` Sát thương Nguyên tố (Elemental DMG) mỗi rank. |
| **Chest / Head** | **Sharpened** | Champion | Khi cầm Kiếm (Sword) hoặc Rìu (Axe), tăng `+%` Sát thương Chí mạng (Crit DMG) mỗi rank. |
| **Chest / Head** | **Brutality** | Berserker | Tăng mạnh `+%` sát thương lên các mục tiêu đang bị Chảy máu (**Bleeding**). |
| **Chest / Head** | **Hardened** | Defender | Nhận thêm điểm Giáp (Armor) dựa trên mỗi điểm máu/sức bền mỗi rank. |
| **Chest / Head** | **Blessed** | Defender | Tăng `+%` Kháng phép thuật / Kháng nguyên tố mỗi rank. |
| **Ring / Amulet** | **Crush** | Defender | Tăng `+%` sát thương kỹ năng Khiên (Shield DMG) dựa trên tỷ lệ Block hiện có. |
| **Ring / Amulet** | **Bloodbath** | Berserker | Tăng tốc độ đánh và hút máu khi xung quanh có kẻ địch bị chảy máu. |
| **Ring / Amulet** | **Defiance / Sturdy** | Defender | Giảm thời gian bị khống chế và tăng khả năng chặn đòn chí mạng. |
| **Ring / Amulet** | **Warlord / Tactician** | Champion | Tăng hiệu quả và thời gian duy trì của các kỹ năng tiếng thét (*BattleCry / Taunt*). |

### 6.3. Bảng Talents Của ROGUE (Sát Thủ / Xạ Thủ)

| Vị Trí / Nhóm | Tên Talent | Nhánh Chuyên Môn | Hiệu Ứng Mỗi Rank (Cấp) |
| :--- | :--- | :--- | :--- |
| **Chest / Head** | **Pistoleer** | Ranger | Tăng `+%` tỷ lệ viên đạn súng lục nảy (**Ricochet**) sang các kẻ địch kế tiếp mỗi rank. |
| **Chest / Head** | **Fletcher** | Ranger | Tăng `+%` hệ số Tốc độ tấn công (Attack Speed Multiplier) khi sử dụng Cung (Bow). |
| **Chest / Head** | **Deadfall** | Trickster | Tăng `+%` thời gian tồn tại của Bẫy (Trap Duration) và `+%` Sát thương Bẫy (Trap DMG). |
| **Chest / Head** | **Noxious** | Trickster | Kỹ năng Bom Khói (*SmokeBomb*) làm giảm `-%` Kháng của quái vật mỗi rank. |
| **Ring / Amulet** | **Celerity** | Trickster | Tăng tốc độ di chuyển và chuyển hóa một phần tốc độ chạy thành tỷ lệ Né (Dodge). |
| **Ring / Amulet** | **Lethality / Keen** | Assassin | Tăng tỷ lệ chí mạng và sát thương chí mạng khi dùng Dao găm (Dagger) hoặc Chakram. |
| **Ring / Amulet** | **Ambush / Shadow** | Assassin | Kéo dài thời gian Tàng hình (*Stealth*) và khuếch đại sát thương đòn đánh phá tàng hình. |

---

## 7. NHÓM THUỘC TÍNH TREE / MASTERY TALENTS (+ALL SKILLS & +ALL TALENTS)

Để đẩy các Talent ở Mục 6 từ cấp 10 lên cấp **40 – 50+**, người chơi sử dụng các dòng cộng cấp độ kỹ năng diện rộng:

1. **Dòng cộng theo từng nhánh chuyên môn (`+1` đến `+4` trên Legend, lên tới `+6` trên Crystal Affix)**:
   * **Wizard (Pháp Sư)**:
     * **`+X All Elementalist`**: Tăng toàn bộ Talent nhánh 5 Nguyên tố (*Sorcery, Cosmic, Wizardry, Amplify, Astral, Bewilder, Prismatic, Fester*).
     * **`+X All Arch Mage`**: Tăng toàn bộ Talent nhánh Quản lý Mana và Phòng ngự (*Barrier, Focus, Insight, Backfire, Infusion, Magnify, Continuity, Mastery, Empower*).
     * **`+X All Spiritmancer` (hoặc `Spirit Master`)**: Tăng toàn bộ Talent nhánh Triệu Hồi & Gọi Hồn Minions (*Necrotic, Prowess, Boost, Hearty, Diffusion, Spiritual, Reclaim, Recall*). Rất quan trọng cho Summoner Build kết hợp với vũ khí phụ Skull / Totem.
   * **Warrior (Chiến Binh)**:
     * **`+X All Champion`**: Tăng cấp cho nhánh Chiến đấu cơ bản (*Might, Sharpened, Warlord...*).
     * **`+X All Defender`**: Tăng cấp cho nhánh Giáp, Khiên (*Hardened, Blessed, Crush, Sturdy...*).
     * **`+X All Berserker`**: Tăng cấp cho nhánh Cuồng nộ (*Brutality, Bloodbath...*).
   * **Rogue (Sát Thủ / Xạ Thủ)**:
     * **`+X All Ranger`**: Tăng cấp cho nhánh Bắn cung và Súng lục (*Pistoleer, Fletcher...*).
     * **`+X All Trickster`**: Tăng cấp cho nhánh Bẫy và Né đòn (*Deadfall, Noxious, Celerity...*).
     * **`+X All Assassin`**: Tăng cấp cho nhánh Dao găm, Tàng hình và Bạo kích (*Lethality, Ambush...*).
2. **Dòng cộng tổng quát**:
   * **`+X All Skills`**: Tăng cấp độ cho cả 4 kỹ năng Vũ khí đang trang bị (Tối đa cấp 40). Kỹ năng vũ khí cấp càng cao thì hệ số sát thương và số lượng đạn bắn ra càng lớn.
   * **`+X All Talents`**: Tăng cấp độ cho toàn bộ các Talent đang mặc trên người (Có thể tìm thấy trên dòng Legend Affix hoặc khi gắn viên đá **Elixir Mythstone** số #20 vào Giáp!).
   * **`+X All Sets`**: Tăng Rank cho toàn bộ các bộ Set đang mặc trên người (Có được khi gắn viên đá **Elixir Mythstone** số #20 vào Nhẫn/Dây chuyền!).

---

## 8. HỆ THỐNG 5 NGUYÊN TỐ, BẠO KÍCH NGUYÊN TỐ (ELEMENTAL CRIT) & DOT

### 8.1. Đặc Tính 5 Hệ Nguyên Tố & Hiệu Ứng Elemental Crit
Mỗi đòn đánh có xác suất gây **Elemental Critical** (phụ thuộc vào chỉ số *Elemental Crit Chance*, Talent *Wizardry*, hoặc Mythic *Nova*). Khi nổ Elemental Crit, hiệu ứng đặc biệt sẽ kích hoạt:

| Nguyên Tố | Trạng Thái Cơ Bản | Hiệu Ứng Khi Nổ Elemental Crit | Dòng Legend Cường Hóa Tương Ứng |
| :--- | :--- | :--- | :--- |
| **Fire (Lửa)** | **Burn / Immolate**: Thiêu đốt rút máu theo giây. | Tạo vụ nổ lửa lan và cộng dồn sát thương đốt. | **Blistering**: Khiến mục tiêu đang bị *Burn* nhận thêm sát thương chảy máu cộng dồn cực lớn. |
| **Ice (Băng)** | **Chill**: Làm chậm tốc độ chạy và tốc độ đánh của địch. | **Freeze**: Đóng băng cứng hoàn toàn mục tiêu. | **Frostbiting**: Tăng cực mạnh `%` sát thương gây ra lên các mục tiêu đang bị *Freeze*. |
| **Shock (Điện)** | **Electrocute**: Giật điện lan giữa các mục tiêu đứng gần. | **Paralyze / Stun**: Làm tê liệt/choáng và phóng sét chuỗi. | **High Voltage**: Khuếch đại sát thương bùng nổ lên các mục tiêu đang bị *Paralyze/Stun*. |
| **Poison (Độc)** | **Toxic / Poison Cloud**: Tạo mây độc rút máu liên tục. | Nhân bội số tầng độc tố và giảm sát thương của quái. | **Blight**: Tăng tốc độ nhảy sát thương độc (DoT Tick) và cho phép độc nổ bạo kích. |
| **Arcane (Bí Ẩn)** | **Arcane Debuff**: Gây sát thương nổ trực tiếp. | Tạo các tia **Orbit (Quả cầu năng lượng)** xoay quanh mục tiêu. | **Celestial**: Cường hóa mạnh sát thương của các quả cầu *Orbit* và tia năng lượng Arcane. |

---

## 9. HỆ THỐNG CƠ CHẾ KÍCH HOẠT TỰ ĐỘNG (ON-HIT PROC MECHANICS)

Các dòng **Proc (`+X% Chance to Cast [Skill] on Hit / Attack`)** tự động tung ra kỹ năng mà không tốn thời gian hoạt ảnh và không tốn Mana. Tần suất kích hoạt phụ thuộc vào **Tốc độ đánh (Attack Speed)**, **Multi Attack**, số lượng tia đạn và viên đá **Master Mythstone (#18)**:

* **Twister Proc**: Tự động phóng ra các cơn lốc xoáy càn quét bản đồ khi đánh trúng đích.
* **Torrent Proc**: Tự động bắn ra luồng kiếm khí/năng lượng liên hoàn.
* **Meteor / Comet / Shatter Proc**: Tự động giáng thiên thạch lửa, băng hoặc nổ băng ngay tại vị trí mục tiêu.
* **Orbit / Storm Proc**: Tự động tạo vòng cầu xoay hoặc bão sấm sét quanh mục tiêu.
* **Summon Fury / Zombie / Skull Proc**: Tự động triệu hồi đệ tử hỗ trợ tấn công và đỡ đạn.
* **Taunt / Mirror Image / Stealth / SmokeBomb Proc**: Tự động gom quái, tạo phân thân, tàng hình hoặc thả bom khói phòng thủ.

---

## 10. TỪ ĐIỂN SET AFFIXES TOÀN TẬP (MÀU XANH LÁ)

Mỗi dòng **Set Affix** trên 1 món trang bị thường có giá trị từ **Rank 1 đến Rank 5** (Dùng đá *Peridot* để nâng lên Rank 5). Nếu dòng Set nằm trên đồ **Eternal**, nó tự động có giá trị gấp đôi (**Rank 10** trên 1 món!). Đa số các bộ Set đạt hiệu quả tối đa ở mốc **Rank 5 đến Rank 8** (hoặc cao hơn tùy bộ).

### 10.1. Nhóm Set Cày Đồ (Farming Sets - Quan Trọng Bậc Nhất)
* **Eternalized** *(Chỉ rơi tự nhiên)*: Tăng **+25% đến +50% tỷ lệ rơi đồ Eternal (Xanh lục bảo)** mỗi Rank. Đây là bộ Set bắt buộc phải có để săn đồ cuối game.
* **Crystalline** *(Roll được bằng Amethyst / Rơi tự nhiên)*: Tăng mạnh tỷ lệ rơi **đá Crystal cấp cao** và trang bị có sẵn dòng **Crystal Affix (Cyan)**.
* **Nadroji** *(Chỉ rơi tự nhiên)*: Tăng tỷ lệ xuất hiện quái **Rare / Epic / Legend** và tăng chất lượng trang bị rơi ra. *(Lưu ý: Ở một số bản cập nhật, mặc quá nhiều Nadroji có thể đổi phân bổ bậc đồ, nên thường giữ ở mức vừa đủ kích hoạt kết hợp với Eternalized).*
* **Mythical** *(Set)*: Tăng tỷ lệ rơi các viên đá **Mythstones** cấp cao.
* **Adventurer**: Tăng tốc độ di chuyển và sát thương tỉ lệ thuận với lượng Vàng nhặt được.

### 10.2. Nhóm Set Tấn Công Nguyên Tố & Phép Thuật (Roll Được Bằng Amethyst)
* **Ascendant**: Mảnh ghép cốt lõi của hệ Arcane. Tăng All Resist, cho cơ hội đổi nguyên tố đòn đánh (Prismatic), kéo dài thời gian **Arcane Debuff lên 5 giây** và **trừ tới 62.5% Kháng của quái vật**.
* **Arcanist**: Đòn bạo kích áp dụng cộng dồn Arcane Debuff, tăng vọt `% Elemental DMG` cho mỗi kẻ địch đang dính trạng thái này (Cặp bài trùng với *Ascendant*).
* **Equality**: Tăng mạnh sát thương và hồi phục toàn diện dựa trên độ cân bằng giữa **Max HP và Max MP** (Đạt 100% sức mạnh khi đi kèm Resource Mythic **Equivalence**).
* **Aethereal Drain**: Tăng Elemental Crit Chance và Max MP; chuyển hóa đòn bạo kích nguyên tố thành hồi phục MP tức thì (nhưng bỏ hồi MP tự nhiên).
* **Cerebral Vortex**: Tăng Max MP và All Resist; có tỷ lệ tự động tung chiêu *Torrent* mỗi khi nhận sát thương.
* **Crushing Flames / Inferno (Hệ Lửa)**: Tăng sát thương Lửa; quái bị thiêu đốt sẽ phát nổ khi chết, gây sát thương lan toàn màn hình.
* **Permafrost / Frozen (Hệ Băng)**: Tăng tỷ lệ đóng băng, kéo dài thời gian *Freeze* và nhân sát thương lên mục tiêu đóng băng.
* **Reactor (Hệ Điện)**: Mỗi khi gây hiệu ứng *Shock*, phát nổ một xung điện trường quanh người chơi.
* **Plagued (Hệ Độc)**: Khi một quái vật chết vì độc, toàn bộ tầng độc tố lây nhiễm ngay lập tức sang các quái vật xung quanh.
* **Battle Mage**: Chuyển hóa một phần chỉ số sát thương phép thuật thành Giáp và sức chống chịu cận chiến.

### 10.3. Nhóm Set Vật Lý, Sát Thủ & Độc Quyền Chiến Đấu
* **Momentum**: Nhân vật di chuyển liên tục sẽ tích điểm Momentum, nhân bội sát thương cho các đòn tấn công.
* **Rage / Berserker**: Tích lũy độ điên cuồng khi cận chiến, tăng tốc đánh và sát thương vật lý.
* **Ninja**: Tăng Dodge; tự động tàng hình (*Stealth*) và tăng mạnh sát thương chí mạng sau khi hạ gục mục tiêu.
* **Pathfinder**: Tăng tốc độ chạy và miễn nhiễm hiệu ứng làm chậm trên mặt đất.
* **Angelic**: Đòn đánh hồi máu cho đồng minh/đệ tử xung quanh và tăng tốc độ đánh cho các kỹ năng liên thanh.
* **Demonic**: Tăng mạnh khả năng hút máu hắc ám và sát thương khi máu thấp.
* **Epiphany** *(Độc quyền)*: Nâng trần chỉ số **Clearcast lên 75%** và tăng sát thương kỹ năng mỗi khi kích hoạt Clearcast.
* **Masochism / Bloodsoaked** *(Độc quyền)*: Tăng sát thương gây ra dựa trên lượng máu đã mất hoặc sát thương gánh chịu (Cực mạnh khi đi với *BloodMagic*).
* **Defiant** *(Độc quyền)*: Tăng vọt khả năng giảm thương (Damage Reduction) khi máu xuống thấp.

---

## 11. HỆ THỐNG RESOURCE MYTHIC (QUẢN LÝ TÀI NGUYÊN ĐỘC QUYỀN)

> **Quy tắc bắt buộc**: Có tất cả **6 Resource System Mythics**. Chúng có thể được khảm lên **BẤT KỲ vị trí trang bị nào (Any Slot)** có 4 lỗ. Tuy nhiên, trên toàn bộ 6 món đồ đang mặc, **CHỈ DUY NHẤT 1 RESOURCE MYTHIC ĐƯỢC PHÉP HOẠT ĐỘNG**.

| Tên Resource Mythic | Thứ Tự 4 Viên Mythstone (MS-1 -> MS-4) | Cơ Chế Hoạt Động Chi Tiết |
| :--- | :--- | :--- |
| **1. BloodMagic** | `Hero` -> `Gift` -> `Endow` -> `Master` | Xóa bỏ hoàn toàn thanh MP. Mọi kỹ năng chuyển sang dùng **Máu (HP)**. Giảm 50% chi phí kỹ năng và **tăng mạnh sát thương dựa trên % Máu đã mất**. |
| **2. Equivalence** | `Mentor` -> `Protest` -> `Wisdom` -> `Death` | Cộng tổng Max HP và Max MP rồi chia đôi để **ép Max HP = Max MP (tỷ lệ 1:1)**. Kích hoạt vĩnh viễn 100% sức mạnh của bộ Set **Equality**. |
| **3. Energy** | `Clarity` -> `Abyss` -> `Return` -> `Wisdom` | Cố định thanh tài nguyên ở mức **100 Energy** với tốc độ tự hồi phục cực nhanh (tương tự nội năng của Sát thủ), cho phép spam chiêu liên tục. |
| **4. Fury** | `Boon` -> `Haste` -> `Rebirth` -> `Time` | Thay thế Mana bằng thanh **Nộ khí (Fury)**. Đánh thường tích Fury, dùng kỹ năng lớn tiêu hao Fury và tăng sát thương khi đầy nộ. |
| **5. Discordance** | `Protest` -> `Boon` -> `Wisdom` -> `Elixir` | Xóa bỏ các nút kỹ năng vũ khí thông thường; thay vào đó **tăng mạnh tỷ lệ tự động kích hoạt (Proc) toàn bộ các kỹ năng vũ khí cùng lúc** mỗi khi bạn đánh thường! |
| **6. Alchemy** | `Boon` -> `Gift` -> `Elixir` -> `Time` | Thay đổi cơ chế bình thuốc (Potions) và quả cầu máu/mana thành chất xúc tác cường hóa sát thương và hồi phục kép. |

---

## 12. BẢNG TRA CỨU CHUẨN 20 LOẠI MYTHSTONES (THEO VỊ TRÍ KHẢM)

Trong *Dungeon Quest*, có chính xác **20 loại Mythstones** xếp theo thứ tự từ `#1` đến `#20`. Cứ ghép **3 viên cùng bậc** sẽ được **1 viên bậc kế tiếp**.
Khi gắn rời (chưa tạo thành công thức Mythic), hiệu ứng của viên đá phụ thuộc vào việc bạn gắn nó vào **Weapon (MH/OH)**, **Armor (Chest/Head)** hay **Jewelry (Ring/Amulet)**:

| Bậc | Tên Mythstone | Khi Gắn Vào Vũ Khí (Weapon) | Khi Gắn Vào Giáp (Armor) | Khi Gắn Vào Trang Sức (Jewelry) |
| :---: | :--- | :--- | :--- | :--- |
| **#1** | **Hero** | Tăng `+%` Total HP | Tăng `+%` Total HP | Tăng `+%` Total HP |
| **#2** | **Mentor** | Tăng `+%` Total MP | Tăng `+%` Total MP | Tăng `+%` Total MP |
| **#3** | **Protest** | Tăng `+Điểm` All Resist | Tăng `+Điểm` All Resist | Tăng `+Điểm` All Resist |
| **#4** | **Boon** | Hồi `+%` Total HP khi đánh trúng (On Hit) | Hồi `+%` Total HP khi đánh trúng | Hồi `+%` Total HP khi đánh trúng |
| **#5** | **Gift** | Hồi `+%` Total MP khi đánh trúng (On Hit) | Hồi `+%` Total MP khi đánh trúng | Hồi `+%` Total MP khi đánh trúng |
| **#6** | **Wisdom** | Giảm `-%` tiêu hao năng lượng (Reduce Cost) | Giảm `-%` tiêu hao năng lượng | Giảm `-%` tiêu hao năng lượng |
| **#7** | **Clarity** | Tăng `+%` tỷ lệ tung chiêu miễn phí (**Clearcast**) | Tăng `+%` **Clearcast** | Tăng `+%` **Clearcast** |
| **#8** | **Endow** | Tăng `+%` **Weapon Damage** | Tăng `+%` **Total All Resist** | Tăng `+%` **Total All Resist** |
| **#9** | **Haste** | Tăng `+%` Tốc độ đánh (**Attack Speed**) | Tăng `+%` **Attack Speed** | Tăng `+%` **Attack Speed** |
| **#10** | **Death** | Tăng `+%` tỷ lệ **Deadly Strike** | Tăng `+%` tỷ lệ **Deadly Strike** | Tăng `+%` tỷ lệ **Deadly Strike** |
| **#11** | **Abyss** | Tăng `+%` tỷ lệ **Elemental Weaken** | Tăng `+%` **Elemental Weaken** | Tăng `+%` **Elemental Weaken** |
| **#12** | **Rebirth** | Tăng `+%` tỷ lệ **Crushing Blow** | Tăng `+%` **Crushing Blow** | Tăng `+%` **Crushing Blow** |
| **#13** | **Flight** | Tăng `+%` Tốc độ chạy (**Move Speed**) | Tăng `+%` **Move Speed** | Tăng `+%` **Move Speed** |
| **#14** | **Quest** | Tăng `+30%` Kinh nghiệm (**EXP Gain**) | Tăng `+30%` **EXP Gain** | Tăng `+40%` **EXP Gain** |
| **#15** | **Fortune** | Tăng `+40%` Tỷ lệ rơi đồ (**Item Drop**) | Tăng `+30%` **Item Drop** | Tăng `+30%` **Item Drop** |
| **#16** | **Return** | Chuyển hóa `+%` sát thương nhận vào thành MP | Chuyển hóa `+%` DMG nhận vào thành MP | Chuyển hóa `+%` DMG nhận vào thành MP |
| **#17** | **Time** | Giảm `-%` thời gian hồi chiêu (**Cooldown**) | Giảm `-%` **Cooldown** | Giảm `-%` **Cooldown** |
| **#18** | **Master** | Tăng `+%` tỷ lệ kích hoạt kỹ năng **Proc** | Tăng `+%` tỷ lệ kích hoạt **Proc** | Tăng `+%` tỷ lệ kích hoạt **Proc** |
| **#19** | **Zenith** | Cộng thêm **+Extra Attack Chance** | Cộng thêm tỷ lệ **Pierce (Xuyên táo)** | Cộng thêm **+Multi Attack (50% DMG)** |
| **#20** | **Elixir** | Tăng **+2 Rank cho mọi Skills** | Tăng **+2 Rank cho mọi Talents** | Tăng **+2 Rank cho mọi Set Items** |

> **Mẹo End-game cực hay**: Bạn không bắt buộc phải khảm công thức Mythic cho tất cả 6 món! Rất nhiều cao thủ để trống 4 lỗ trên 1–2 món trang bị để khảm trực tiếp **4 viên Elixir (#20)** hoặc **Zenith (#19)** nhằm lấy **+8 All Sets / +8 All Talents / +8 All Skills**!

---

## 13. BẢNG TỔNG HỢP TOÀN BỘ CÔNG THỨC GHÉP ĐỒ MYTHIC (MYTHIC RECIPES)

Để ghép đồ Mythic, trang bị phải có đủ **4 lỗ cắm (Sockets)** và bạn phải gắn **đúng thứ tự 4 viên Mythstone từ lỗ số 1 đến lỗ số 4**:

### 13.1. Vị Trí Vũ Khí Chính (Main-Hand Weapon - MH)
| Tên Mythic | Thứ Tự 4 Viên Mythstone (`MS-1` -> `MS-2` -> `MS-3` -> `MS-4`) | Hiệu Ứng Kỹ Năng / Nội Tại |
| :--- | :--- | :--- |
| **Cyclone** | `Hero` -> `Boon` -> `Haste` -> `Flight` | Xoay tròn vũ khí liên tục, vừa chém vừa hút toàn bộ quái xung quanh vào tâm. |
| **Bombard** | `Mentor` -> `Endow` -> `Death` -> `Master` | Triệu hồi mưa thiên thạch oanh tạc liên hoàn từ bầu trời xuống khu vực chỉ định. |
| **CosmicOrb** | `Gift` -> `Wisdom` -> `Clarity` -> `Return` | Phóng ra quả cầu vũ trụ bay chậm, liên tục bắn các tia năng lượng gây 100% MH DMG. |
| **Apocalypse** | `Hero` -> `Protest` -> `Endow` -> `Quest` | Triệu hồi 3 tinh linh Fury khổng lồ rơi từ trên trời xuống đập nát mặt đất. |
| **Ricochet / Barrage** | *(Tùy biến theo Class)* | Cường hóa khả năng bắn đạn nảy hoặc mưa đạn toàn màn hình. |

### 13.2. Vị Trí Vũ Khí Phụ (Off-Hand Weapon - OH)
| Tên Mythic | Thứ Tự 4 Viên Mythstone (`MS-1` -> `MS-2` -> `MS-3` -> `MS-4`) | Hiệu Ứng Kỹ Năng / Nội Tại |
| :--- | :--- | :--- |
| **Enigma** | `Haste` -> `Quest` -> `Fortune` -> `Elixir` | Bóp méo không gian và **Teleport (Dịch chuyển)** về phía trước, làm nổ tung mặt đất ở cả điểm đi và điểm đến (Cho phép mọi Class đều có kỹ năng Teleport siêu tốc!). |
| **Nova** | `Gift` -> `Haste` -> `Abyss` -> `Return` | Tạo vụ nổ nguyên tố xung quanh bản thân với **100% tỷ lệ gây Bạo kích Nguyên tố (Elemental Crit)**. |
| **Vanish** | `Protest` -> `Clarity` -> `Death` -> `Flight` | Có 10% tỷ lệ mỗi giây khi tấn công sẽ tự động kích hoạt **Vanish (Tàng hình)**. |

### 13.3. Vị Trí Áo Giáp (Chest Armor)
| Tên Mythic | Thứ Tự 4 Viên Mythstone (`MS-1` -> `MS-2` -> `MS-3` -> `MS-4`) | Hiệu Ứng Nội Tại |
| :--- | :--- | :--- |
| **Skilled** | `Boon` -> `Gift` -> `Clarity` -> `Haste` | Tăng trực tiếp **+50% sát thương** cho kỹ năng đánh chính (Primary Skill). |
| **Brutal** | `Wisdom` -> `Haste` -> `Death` -> `Master` | Đòn **Deadly Strike** gây gấp **3x sát thương bạo kích** thay vì 2x như mặc định. |
| **Exposed** | `Gift` -> `Clarity` -> `Abyss` -> `Zenith` | Kẻ địch bị đòn đánh xuyên qua (**Pierced**) phải nhận thêm **+50% sát thương**. |
| **Ruptured** | `Hero` -> `Boon` -> `Flight` -> `Time` | Kẻ địch đang bị chảy máu (**Bleeding**) phải nhận thêm **+50% sát thương**. |
| **Sureshot** | `Boon` -> `Haste` -> `Death` -> `Quest` | Đạt **100% tỷ lệ chí mạng (Crit Chance)** khi tấn công kẻ địch đang đầy máu (Full HP). |
| **Mirrored** | `Hero` -> `Boon` -> `Endow` -> `Return` | Sát thương phản đòn (**Reflect DMG**) được tăng thêm theo tỷ lệ **Block Chance**. |

### 13.4. Vị Trí Mũ (Head Armor)
| Tên Mythic | Thứ Tự 4 Viên Mythstone (`MS-1` -> `MS-2` -> `MS-3` -> `MS-4`) | Hiệu Ứng Nội Tại |
| :--- | :--- | :--- |
| **Harmony** | `Protest` -> `Boon` -> `Endow` -> `Flight` | Mỗi khi hồi HP sẽ nhận thêm 25% lượng đó thành MP; mỗi khi hồi MP nhận thêm 25% lượng đó thành HP. |
| **Serenity** | `Clarity` -> `Death` -> `Flight` -> `Time` | Hồi phục **2% Max MP** trên mỗi đòn đánh Bạo kích (Critical Hit). |
| **Fleeting** | `Mentor` -> `Clarity` -> `Flight` -> `Return` | Khi đang di chuyển, tốc độ hồi tài nguyên tăng **+25%** (Khi đứng yên giảm 25%). |
| **Synergy** | `Hero` -> `Boon` -> `Endow` -> `Master` | Hiệu ứng hồi 10% máu của *Command* và +50% tốc độ của *Summon* tác dụng lên cả bản thân người chơi. |
| **Recover** | `Hero` -> `Mentor` -> `Flight` -> `Fortune` | Tăng **+100% HP Regen** khi không dùng kỹ năng trong 2 giây. |
| **Desperation** | `Boon` -> `Haste` -> `Rebirth` -> `Time` | Khi tung chiêu mà không đủ năng lượng, lập tức hồi lượng MP bằng chỉ số MP Regen. |

### 13.5. Vị Trí Nhẫn (Ring)
| Tên Mythic | Thứ Tự 4 Viên Mythstone (`MS-1` -> `MS-2` -> `MS-3` -> `MS-4`) | Hiệu Ứng Nội Tại |
| :--- | :--- | :--- |
| **Hunter** | `Rebirth` -> `Flight` -> `Quest` -> `Fortune` | Mỗi khi kích hoạt đền thờ (**Shrine**), luôn triệu hồi thêm **1–3 quái Shrine Guardians (Epic)** để săn đồ và EXP. *(Không cộng dồn với Ascension Perk Hunter).* |
| **Unity** | `Protest` -> `Wisdom` -> `Endow` -> `Abyss` | Toàn bộ 5 chỉ số Kháng nguyên tố của bạn sẽ **tự động bằng với chỉ số Kháng đơn cao nhất**. |
| **Dauntless** | `Boon` -> `Clarity` -> `Haste` -> `Death` | Giảm **-1% sát thương nhận vào** cho mỗi kẻ địch đứng trong bán kính 10 yards quanh bạn. |
| **Effective** | `Protest` -> `Endow` -> `Rebirth` -> `Return` | Khi gây sát thương, tự động đổi nguyên tố đòn đánh sang nguyên tố mà kẻ địch đó yếu nhất (Khắc hệ). |
| **Resourceful** | `Mentor` -> `Gift` -> `Wisdom` -> `Clarity` | Khi nhặt các quả cầu Máu/Mana rơi ra, chúng phát nổ gây sát thương diện rộng theo % hồi phục. |
| **Draught** | `Gift` -> `Death` -> `Rebirth` -> `Master` | Bình thuốc MP không hồi MP nữa mà tăng **+50% Tốc độ đánh và Tốc độ chạy** trong 3 giây. |

### 13.6. Vị Trí Dây Chuyền (Amulet)
| Tên Mythic | Thứ Tự 4 Viên Mythstone (`MS-1` -> `MS-2` -> `MS-3` -> `MS-4`) | Hiệu Ứng Nội Tại |
| :--- | :--- | :--- |
| **Sanctuary** | `Mentor` -> `Wisdom` -> `Endow` -> `Return` | **Bảo hiểm sinh mạng**: Tự động chặn đòn đánh kết liễu và hồi phục **25% Max HP** (Hồi chiêu: 30 giây). Món đồ bắt buộc khi leo tầng cao! |
| **Empyrean** | `Wisdom` -> `Abyss` -> `Return` -> `Time` | Gây thêm **+100% sát thương Vũ khí chính (MH DMG)** mỗi khi bạn kích hoạt Bạo kích Nguyên tố (**Elemental Crit**). |
| **Mythical** | `Death` -> `Abyss` -> `Flight` -> `Elixir` | Toàn bộ các kỹ năng Mythic (**Mythic Skills**) gây thêm **+25% sát thương**. |
| **Adventure** | `Flight` -> `Quest` -> `Fortune` -> `Zenith` | Mỗi khi nhặt Vàng trên sàn, bạn nhận thêm **lượng điểm Kinh nghiệm (EXP) bằng đúng lượng Vàng đó** (Món đồ kéo cấp nhanh nhất game!). |
| **Summoner** | `Hero` -> `Protest` -> `Abyss` -> `Return` | Giảm **-3% sát thương nhận vào** cho mỗi một đệ tử (Minion) đang được triệu hồi trên sân. |
| **Redirect** | `Clarity` -> `Haste` -> `Flight` -> `Time` | Sát thương phản đòn (**Reflect DMG**) giờ đây kích hoạt cả khi bạn Né (Dodge) hoặc Đỡ (Block) đòn đánh. |

---

## 14. ĐIỂM ANH HÙNG (HEROIC POINTS), CHUYỂN SINH (6 ASCENSION PERKS) & ĐỘ KHÓ

### 14.1. Điểm Anh Hùng (Heroic Points)
Khi nhân vật lên cấp (từ Lv.1 đến Lv.99, và tiếp tục nhận điểm thưởng mỗi khi đầy thanh EXP ở Lv.99), bạn có thể phân bổ điểm vào 4 thuộc tính (có thể Reset miễn phí bất kỳ lúc nào):
* **Power / Strength / Intelligence**: Cộng điểm sát thương cơ bản.
* **Health / Vitality**: Cộng máu phẳng và hồi máu.
* **Dexterity**: Cộng tốc độ đánh và tỷ lệ Né (Dodge).
* **Fortune**: Cộng **Luck, Gold Find và Item Drop Rate** (Luôn ưu tiên cộng Max điểm vào *Fortune* cho bản Build Farming).

### 14.2. Hệ Thống Chuyển Sinh (6 Ascension Perks)
Khi nhân vật đạt **Level 99**, bạn có thể chọn **Ascend (Chuyển sinh)**: Nhân vật quay về Level 1 (giữ nguyên toàn bộ đồ đạc trong Rương và Hireling) để mở khóa vĩnh viễn **1 trong 6 Ascension Perks**. Sau 6 lần Ascend, nhân vật sẽ sở hữu trọn bộ 6 Perks:

| Thứ Tự Ưu Tiên Mở | Tên Ascension Perk | Hiệu Ứng Vĩnh Viễn Mang Lại |
| :---: | :--- | :--- |
| **Ưu tiên #1** | **Fortunate** | Tăng **+200% Luck** và **+200% Gold Find** (Cộng thêm +50% nữa ở các tầng chia hết cho 10). |
| **Ưu tiên #2** | **Treasured** | Tăng mạnh tỷ lệ rơi trang bị **Crystal** và **Eternal**. |
| **Ưu tiên #3** | **Dealer** | Tăng **+1000% lượng Vàng** nhận được khi bán trang bị vào Shop (Giúp bạn dư dả hàng trăm triệu vàng để mua Map và ghép đá). |
| **Ưu tiên #4** | **Enshrined** | Tăng số lượng đền thờ (**Shrines**) xuất hiện trên mỗi tầng và nhân gấp bội hiệu quả buff của Shrine. |
| **Ưu tiên #5** | **Hunter** | Mỗi khi kích hoạt một đền thờ (Shrine), tự động triệu hồi thêm quái **Epic (Shrine Guardians)** để săn đồ. |
| **Ưu tiên #6** | **Accomplished** | Giảm **-25% yêu cầu** của mọi nhiệm vụ Thành tựu (**Feats**), giúp nhận thưởng đá quý và mở khóa Trophy nhanh hơn. |

> **Mẹo kéo cấp Ascension trong 15 phút**: Trước khi bấm Ascend nhân vật chính, hãy chuẩn bị một nhân vật phụ (**Hireling**) đã đạt Lv.99 mặc đồ sát thương diện rộng + đeo dây chuyền Mythic **Adventure** (+EXP theo lượng Vàng nhặt được). Khi nhân vật chính về Lv.1, vào Map bật Hireling lên đi quét quái ở độ khó cao: chỉ cần nhặt vài đống vàng là nhân vật chính sẽ vọt thẳng từ Lv.1 lên Lv.99!

### 14.3. Hệ Thống Độ Khó (Difficulties) & Bản Đồ (Cartographer Maps)
* **Thang độ khó**: `Very Easy` -> `Easy` -> `Normal` -> `Hard` -> `Very Hard` -> `Epic` -> `Legend 1–5` -> `Mythic 1` -> `Mythic 2` -> **`Mythic 3` (Tối đa)**.
  * Ở **Mythic 3**, máu và sát thương của quái tăng mạnh nhưng bù lại mở khóa ngưỡng rơi **Crystal cấp cao, Mythstone cấp cao và đồ Eternal** tốt nhất.
* **Cartographer (Bản Đồ Hầm Ngục)**:
  * Mua từ Shop bằng Vàng và có thể dùng Crystal để ép dòng giống hệt trang bị!
  * Các dòng bản đồ (**Map Affixes**) ngon nhất để cày đồ: **`+% Pack Size`** (Tăng số lượng quái mỗi cụm), **`+% Luck / Gold Find / Item Drop`**, **`+% Epic Monster Spawn`**, **`+Shrines`**.

---

## 15. HỆ THỐNG HIRELING, PETS, TROPHIES, SHRINES & BATTLE ARENA

1. **Hireling (Đệ Tử Đồng Hành)**:
   * Là một nhân vật khác trong tài khoản của bạn được thuê vào đi cùng trong hầm ngục (tốn một chút Vàng mỗi tầng).
   * **Cơ chế cộng hưởng cực quan trọng**: Các chỉ số **Luck, Gold Find, Item Drop** và các bộ Set cày đồ (**Eternalized, Crystalline, Nadroji**) mặc trên người Hireling **ĐƯỢC CỘNG DỒN / HỖ TRỢ TRỰC TIẾP** cho quá trình rơi đồ trong Map! Bạn có thể điều khiển Main hoặc bấm nút chuyển sang điều khiển trực tiếp Hireling bất cứ lúc nào.
2. **Pets (Thú Cưng)**:
   * Tự động chạy nhặt Vàng, Trang bị, Đá quý, Bình máu/mana giúp người chơi.
   * Mỗi con Pet có các dòng chỉ số riêng (tối đa phẩm chất Legend/Eternal) và **mang được cả dòng Set Affix / Crystal Affix / Legend Affix**!
   * Có thể dùng đá **Calcite** đổi nguyên tố cho Pet, và cho Pet ăn trang bị thừa để tăng cấp/hồi năng lượng.
3. **Trophies (Cúp Danh Hiệu)**:
   * Mở khóa vĩnh viễn khi hoàn thành chuỗi Thành tựu (**Feats**).
   * Trang bị vào ô Trophy giúp cộng thẳng các chỉ số quý hiếm (như *+All Skills, +Luck, +Crit DMG, +All Resist*) mà không tốn slot trang bị.
4. **Shrines (Đền Thờ Buff Trong Map)**:
   * Chạm vào Shrine trong hầm ngục sẽ nhận ngẫu nhiên các bùa lợi cực mạnh trong thời gian ngắn: Tăng tốc chạy, Tăng 100% Crit, Tăng gấp đôi tốc đánh, Tăng hàng trăm % Luck/Gold/EXP.
   * Kết hợp Perk **Enshrined** + **Hunter** biến mỗi cây Shrine thành một "mỏ quái Epic" rơi đầy đồ Legend/Eternal.
5. **Battle Arena (Đấu Trường PvP)**:
   * Chế độ đấu 1v1 với AI điều khiển nhân vật của người chơi khác qua các hạng giải: *Common -> Magic -> Rare -> Epic -> Legend -> Mythic -> Eternal League*.
   * Phần thưởng chuỗi thắng và cuối mùa giải bao gồm **Arena Crystals/Tokens** và **Trang bị độc quyền Arena** sở hữu những dòng giảm thương/xuyên kháng đặc biệt.

---

## 16. BẢNG CHỈ SỐ TRẦN CỐT LÕI (STAT CAPS) & CÔNG THỨC GIẢM THƯƠNG

Khi phối đồ (Crafting), tuyệt đối lưu ý bảng **Ngưỡng Trần Cứng (Hard Caps)** dưới đây để không bị lãng phí dòng thuộc tính trên trang bị:

| Tên Chỉ Số | Tên Tiếng Anh Trong Game | Ngưỡng Trần Tối Đa (Hard Cap) | Ghi Chú Tối Ưu |
| :--- | :--- | :---: | :--- |
| **Kháng tất cả nguyên tố** | All Resist (AR) | **75%** *(Tối đa 80%)* | Bắt buộc đạt 75% khi leo tầng cao. |
| **Tỷ lệ Né đòn** | Dodge Chance | **60%** *(Lên 75% với Talent/Set)* | Lớp phòng thủ quan trọng nhất ở Floor 500+. |
| **Tỷ lệ Đỡ đòn (Khiên)** | Block Chance | **60%** *(Lên 75% với ShieldWall)* | Giảm mạnh sát thương cho Warrior. |
| **Tỷ lệ Bạo kích** | Critical Chance | **60%** |(Riêng *Sureshot Mythic* cho 100% Crit ở đòn đầu). |
| **Sát thương Bạo kích** | Critical Damage | **+350%** | Nhân thêm 2x hoặc 3x nhờ *Deadly Strike* + *Brutal*. |
| **Tỷ lệ Tung chiêu 0 MP** | Clearcast | **60%** *(Lên 75% với Set Epiphany)* | Giúp spam kỹ năng không bao giờ cạn Mana. |
| **Giảm tiêu hao năng lượng** | Reduce Resource Cost | **60%** | Cộng dồn hiệu quả với Clearcast. |
| **Giảm hồi chiêu** | Cooldown Reduction (CDR) | **60%** | Giúp duy trì *ManaShield / TimeWarp / Stealth* liên tục. |
| **Tốc độ Tấn công** | Attack Speed | **+60%** | Tăng tốc độ ra đòn và mật độ kích hoạt Proc. |
| **Tốc độ Di chuyển** | Movement Speed | **+60%** | Giúp dọn Map siêu tốc. |
| **May mắn (Săn đồ hiếm)** | Luck (Magic Find) | **650%** *(Trong Map: 1000%+ với Shrine)* | Trần trang bị hiển thị ở 650%. |
| **Tỷ lệ Nhặt Vàng** | Gold Find | **650%** *(Trong Map: 1000%+ với Shrine)* | Trần trang bị hiển thị ở 650%. |
| **Tỷ lệ Rơi Vật Phẩm** | Item Drop Rate | **+200%** | Tăng số lượng vật phẩm và đá rơi ra từ mỗi con quái. |
| **Cấp độ Kỹ năng / Talent** | Skill / Talent Rank | **Rank 40** | Gốc tối đa 10 + cộng thêm tối đa 30 từ trang bị. |

---

## 17. HƯỚNG DẪN PHỐI ĐỒ META: ULTIMATE FARMING BUILD & CLIMBING FLOOR 1000+

### 17.1. Bản Build Số 1: "Ultimate Speed Farming" (Săn Đồ Eternal & Đá Obsidian/Ruby)
Mục tiêu của bản Build này là quét sạch **Floor 200 – 500 ở độ khó Mythic 3** chỉ trong **30 – 45 giây mỗi Map** với lượng đồ rơi ra ngập màn hình:

* **Cặp đôi Nhân vật khuyên dùng**:
  * **Main**: **Rogue cầm Flintlock (Súng lục)** (Kỹ năng *Ricochet* đạn tự nảy toàn bản đồ) + Vũ khí phụ khảm Mythic **Enigma** (để bay *Teleport* xuyên tường).
  * **Hireling (Đệ tử đi cùng)**: **Wizard cầm Wand/Staff** hoặc **Warrior cầm Horn (Taunt)** chạy theo gom quái và phụ sát thương diện rộng.
* **Các Bộ Set Bắt Buộc Phải Đủ (Chia đều trên Main + Hireling + Pet)**:
  1. **Eternalized (Rank 5+)**: Tối đa hóa tỷ lệ rơi đồ xanh lục bảo **Eternal**.
  2. **Crystalline (Rank 5+)**: Tối đa hóa tỷ lệ rơi đá **Crystal** và đồ có dòng **Cyan**.
  3. **Nadroji (Rank 5)**: Tăng số lượng quái hiếm và chất lượng đồ.
  4. **Fortunate / Adventurer**: Bổ sung tốc chạy và chỉ số kinh tế.
* **Các Dòng Mythic Bắt Buộc Cho Farming**:
  * Vũ khí phụ: **Enigma** (Dịch chuyển tức thời).
  * Nhẫn: **Hunter** (Gọi 1–3 quái Epic mỗi khi chạm vào Shrine - nếu chưa mở Perk Hunter).
  * Dây chuyền: **Adventure** (Nếu đang cần kéo cấp/cày Heroic Points siêu tốc) hoặc **Sanctuary**.
* **Chỉ số mục tiêu**: Đưa **Luck (650%)**, **Gold Find (650%)**, **Item Drop (+200%)** và **Move Speed (+60%)** chạm trần!

### 17.2. Bản Build Số 2: "End-Game Floor 1000 – 2000+ Climber" (Leo Tháp Cao Cấp)
Khi vượt ngưỡng **Floor 800 – 1000+ (Mythic 3)**, máu của quái vật tăng theo cấp số nhân và chỉ cần 1 đòn đánh thường của quái cũng đủ kết liễu người chơi nếu thiếu cơ chế bảo vệ. Công thức chiến thắng ở tầng cao gồm 3 trụ cột:

1. **Trụ cột Sát Thương (Gọt máu theo % + Nhân bội Nguyên tố)**:
   * Bắt buộc có **Crushing Blow (CB%)** cao (từ dòng Crystal Affix hoặc đá *Rebirth Mythstone*) để gọt thẳng **25% máu hiện tại** của quái mỗi nhịp đánh.
   * Kết hợp cặp Set **Ascendant (Rank 5) + Arcanist (Rank 5)** để trừ **62.5% Kháng** của quái và khuếch đại hàng nghìn phần trăm sát thương nguyên tố.
   * Chọn 1 trong 2 hướng Resource Mythic mạnh nhất:
     * **Hướng 1**: **Equivalence Mythic** + **Equality Set (Rank 5)** (Vừa trâu vừa nhân sát thương ổn định).
     * **Hướng 2**: **BloodMagic Mythic** + **Masochism Set** (Sát thương cực đại khi máu thấp).
   * Áo giáp khảm **Brutal** (x3 sát thương Deadly Strike) hoặc **Skilled** (+50% DMG kỹ năng chính) hoặc **Exposed** (+50% DMG khi đạn xuyên táo).
2. **Trụ cột Tấn Công Tự Động (Multi-Hit & Proc)**:
   * Đẩy tối đa **Attack Speed (+60%)**, **Multi Attack (+4 đến +8)** và **Extra Attack Chance** để mỗi giây bắn ra hàng chục tia đạn, kích hoạt liên hoàn *Elemental Crit* + *Crushing Blow* + *Empyrean Mythic*.
3. **Trụ cột Bất Tử (Immortal Defense)**:
   * Dây chuyền bắt buộc khảm **Sanctuary Mythic** (Chặn đòn chết người và hồi 25% HP mỗi 30 giây).
   * Đạt trần **75% All Resist** (Dùng nhẫn **Unity Mythic** nếu muốn tiết kiệm dòng kháng) + **75% Dodge Chance**.
   * Nếu chơi Wizard: Sử dụng **ManaShield** kết hợp Talent **Infusion** + **Barrier** + **Clearcast 75% (Set Epiphany)** để thanh Mana vô tận gánh toàn bộ sát thương thay cho thanh Máu!
