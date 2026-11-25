# Báo Cáo Cập Nhật Code (Git Pull)

- **Thời gian thực hiện:** 21/11/2026 23:47 (GMT+7)
- **Nhánh (Branch):** `master`
- **Kho lưu trữ:** `agentic-soc-platform` (https://github.com/Crystria/agentic-soc-platform)
- **Cập nhật:** Từ commit `07fc09c` lên `d224cd1` (Fast-forward)

---

## 1. Tóm tắt nội dung cập nhật
- **Commit:** `d224cd124afcc87f55e4295195b67be2cb0187ef`
- **Thông điệp commit:** `fix: resolve FOR UPDATE outer join error in recover_orphaned_playbook_runs`
- **Mục đích:** Sửa lỗi khi sử dụng `select_for_update()` cùng với outer join (`select_related`) trong Django ORM bằng cách chỉ định rõ `of=("self",)`.

---

## 2. Chi tiết vị trí và hàm đã chỉnh sửa từ remote

### Tệp: `backend/apps/agentic/services/playbooks.py`
- **Hàm:** `recover_orphaned_playbook_runs()`
- **Vị trí dòng:** Dòng 239 - 245
- **Chi tiết thay đổi:**
  ```python
  # Trước:
  orphaned_runs = list(
      Playbook.objects
      .select_for_update()
      .select_related("user", "case")
      .filter(job_status=PlaybookJobStatus.RUNNING)
  )

  # Sau:
  orphaned_runs = list(
      Playbook.objects
      .select_for_update(of=("self",))
      .select_related("user", "case")
      .filter(job_status=PlaybookJobStatus.RUNNING)
  )
  ```
