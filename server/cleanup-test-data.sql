-- ============================================================================
-- cleanup-test-data.sql —— 清理本地开发库里的压测 / 教程测试残留
-- ============================================================================
--
-- 这个脚本只针对本地 `hmdp` 开发库，**会删除行**（与 usedcar.sql 的
-- 「不删任何一行」原则相反），执行前先确认自己连的是开发库。
--
-- 清掉的东西：
--   * `tb_voucher_order`：压测与手工验证留下的订单
--   * `tb_follow`：涉及测试账号的关注关系
--   * `tb_blog`：测试账号发布的口碑（种子口碑的作者是 1 / 2，不会被删）
--   * `tb_user`：除 5 个种子账号（1 / 2 / 4 / 5 / 6）之外的所有账号
--     —— 包括 `stress_user_*`（200 个）、`176000000xx`（教程 LoginTest 生成的 1000 个）、
--     `USER_NICK_NAME_PREFIX*`（登录流程早期 bug 留下的 4 个）以及手工验证账号
--
-- 为什么可以整表清：这批账号全部是 2026-09-12 之后由测试流程自动创建的，
-- 没有任何真实业务数据挂在上面。
--
-- 运行：
--   cd server
--   set -a && . ./.env && set +a
--   mysql -udev -p"$MYSQL_PASSWORD" hmdp < cleanup-test-data.sql
--
-- 注意：Redis 里可能还有这些账号的 `login:token:{token}`，30 分钟内自然过期；
--       要立刻生效就重新登录一次。
-- ============================================================================

SET NAMES utf8mb4;

DELETE FROM tb_voucher_order
 WHERE user_id NOT IN (1, 2, 4, 5, 6);

DELETE FROM tb_follow
 WHERE user_id NOT IN (1, 2, 4, 5, 6)
    OR follow_user_id NOT IN (1, 2, 4, 5, 6);

DELETE FROM tb_blog
 WHERE user_id NOT IN (1, 2, 4, 5, 6);

DELETE FROM tb_user
 WHERE id NOT IN (1, 2, 4, 5, 6);

-- 自检：期望 users=5 / orders=0 / follows=0 / reviews=4
SELECT
  (SELECT COUNT(*) FROM tb_user)          AS users,
  (SELECT COUNT(*) FROM tb_voucher_order) AS orders,
  (SELECT COUNT(*) FROM tb_follow)        AS follows,
  (SELECT COUNT(*) FROM tb_blog)          AS reviews;
