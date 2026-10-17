package com.axle.dto;

import lombok.Data;

/**
 * 车商 / 车评人主页的公开资料。
 *
 * 只放公开字段：手机号、密码、创建时间一律不出现在这里。
 * `fans` / `followee` / `reviews` 是**实时 count**，不是 `tb_user_info` 里那两个
 * 可能长期不更新的冗余列 —— 关注关系以 `tb_follow` 为准。
 */
@Data
public class UserProfileDTO {
    private Long id;
    private String nickName;
    private String icon;
    /** 粉丝数：多少人关注了 this */
    private Long fans;
    /** 关注数：this 关注了多少人 */
    private Long followee;
    /** 发布的口碑数 */
    private Long reviews;
}
