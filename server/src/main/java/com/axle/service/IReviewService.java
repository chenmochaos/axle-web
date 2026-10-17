package com.axle.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.axle.dto.Result;
import com.axle.entity.Review;

/**
 * <p>
 *  服务类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
public interface IReviewService extends IService<Review> {

    /**
     * 查询热门博客
     *
     * @param current 当前
     * @return {@link Result}
     */
    Result queryHotReview(Integer current);

    /**
     * 通过id查询博客
     *
     * @param id id
     * @return {@link Result}
     */
    Result queryReviewById(Long id);

    /**
     * 点赞博客
     *
     * @param id id
     * @return {@link Result}
     */
    Result likeReview(Long id);

    /**
     * 查询博客点赞排行榜
     *
     * @param id id
     * @return {@link Result}
     */
    Result queryReviewLikesById(Long id);

    /**
     * 保存博客
     *
     * @param review 博客
     * @return {@link Result}
     */
    Result saveReview(Review review);

    /**
     * 查询博客遵循
     *
     * @param max    马克斯
     * @param offset 抵消
     * @return {@link Result}
     */
    Result queryReviewOfFollow(Long max, Integer offset);

    /**
     * 当前登录用户发布的口碑。
     *
     * @param current 页码
     * @return {@link Result}
     */
    Result queryMyReview(Integer current);

    /**
     * 某个用户发布的口碑（公开）。
     *
     * @param current 页码
     * @param userId  作者 id
     * @return {@link Result}
     */
    Result queryReviewOfUser(Integer current, Long userId);
}
