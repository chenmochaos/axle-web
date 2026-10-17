package com.axle.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.axle.dto.LoginFormDTO;
import com.axle.dto.Result;
import com.axle.dto.UserDTO;
import com.axle.entity.User;

import javax.servlet.http.HttpSession;

/**
 * <p>
 *  服务类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
public interface IUserService extends IService<User> {

    /**
     * 发送验证码
     *
     * @param phone   手机号码
     * @param session 会话
     * @return {@link Result}
     */
    Result sendCode(String phone, HttpSession session);

    /**
     * 登录
     *
     * @param loginForm 登录表单
     * @param session   会话
     * @return {@link Result}
     */
    Result login(LoginFormDTO loginForm, HttpSession session);

    /**
     * 签到
     *
     * @return {@link Result}
     */
    Result sign();

    /**
     * 统计连续签到
     *
     * @return {@link Result}
     */
    Result signCount();

    /**
     * 登出：删除 Redis 里的 token。
     *
     * `token` 允许为空 —— 没有 token 的登出是幂等的成功，不该报错。
     *
     * @param token 请求头 `authorization` 里的 token
     * @return {@link Result}
     */
    Result logout(String token);

    /**
     * 公开资料：昵称 / 头像 / 粉丝数 / 关注数 / 口碑数。
     *
     * @param userId 用户 id
     * @return {@link Result}
     */
    Result queryProfile(Long userId);

    /**
     * 修改当前登录用户的昵称与头像，并同步 Redis 里的登录副本。
     *
     * @param userDTO 只读取 nickName / icon
     * @param token   当前 token，用于更新 `login:token:{token}` 里的缓存
     * @return {@link Result} 更新后的 {@link com.axle.dto.UserDTO}
     */
    Result updateProfile(UserDTO userDTO, String token);
}
