# เอกสารประกอบการใช้งาน API (API Documentation)
**ระบบข่าวสาร, ข้อมูลผู้เขียน, ความคิดเห็น และยอดไลก์ (Wix HTTP Functions)**

* **Base URL (Production):** `https://www.comnetmekong.org/_functions`
* **Content-Type:** `application/json`
* **CORS:** รองรับทุก Origin (`*`) และรองรับ Preflight (`OPTIONS`)

---

## สารบัญ
1. [ดึงรายการข่าวทั้งหมด (Get All News)](#1-ดึงรายการข่าวทั้งหมด-get-all-news)
2. [ดึงเนื้อหาข่าวตัวเต็ม (Get Post Detail)](#2-ดึงเนื้อหาข่าวตัวเต็ม-get-post-detail)
3. [ส่งความคิดเห็น (Post Comment)](#3-ส่งความคิดเห็น-post-comment)
4. [กดไลก์ / ยกเลิกไลก์ (Toggle Like/Unlike)](#4-กดไลก์--ยกเลิกไลก์-toggle-likeunlike)
5. [รหัสสถานะ HTTP (HTTP Status Codes)](#5-รหัสสถานะ-http-http-status-codes)

---

## 1. ดึงรายการข่าวทั้งหมด (Get All News)

ดึงรายการบทความทั้งหมดแบบแบ่งหน้า (Pagination) เรียงลำดับจากบทความใหม่ล่าสุดไปเก่าที่สุด พร้อมข้อมูลผู้เขียน, ยอดไลก์รวม และรายการคอมเมนต์ของแต่ละบทความ

* **Endpoint:** `/news`
* **Method:** `GET`
* **Query Parameters:**

| Parameter | Type | Required | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| `limit` | `integer` | ไม่บังคับ | `10` | จำนวนบทความต่อหน้า |
| `skip` | `integer` | ไม่บังคับ | `0` | จำนวนรายการที่ต้องการข้าม (ใช้สำหรับทำ Pagination) |

### ตัวอย่าง Request:
```http
GET [https://www.comnetmekong.org/_functions/news?limit=10&skip=0](https://www.comnetmekong.org/_functions/news?limit=10&skip=0)