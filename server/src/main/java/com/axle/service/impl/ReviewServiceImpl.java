package com.axle.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.BooleanUtil;
import cn.hutool.core.util.StrUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.axle.dto.Result;
import com.axle.dto.ScrollResult;
import com.axle.dto.UserDTO;
import com.axle.entity.Review;
import com.axle.entity.Follow;
import com.axle.entity.User;
import com.axle.mapper.ReviewMapper;
import com.axle.service.IReviewService;
import com.axle.service.IFollowService;
import com.axle.service.IUserService;
import com.axle.utils.RedisConstants;
import com.axle.utils.SystemConstants;
import com.axle.utils.UserHolder;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.*;
import java.util.stream.Collectors;

/**
 * <p>
 * 服务实现类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
@Service
public class ReviewServiceImpl extends ServiceImpl<ReviewMapper, Review> implements IReviewService {
    @Resource
    private IUserService userService;
    @Resource
    private IFollowService followService;
    @Resource
    private StringRedisTemplate stringRedisTemplate;

    @Override
    public Result queryHotReview(Integer current) {
        // 根据用户查询
        Page<Review> page = query()
                .orderByDesc("liked")
                .page(new Page<>(current, SystemConstants.MAX_PAGE_SIZE));
        // 获取当前页数据
        List<Review> records = page.getRecords();
        // 查询用户
        records.forEach(review -> {
            queryReviewUser(review);
            isReviewLiked(review);
        });
        return Result.ok(records);
    }

    @Override
    public Result queryReviewById(Long id) {
        //查询review
        Review review = getById(id);
        if (review == null) {
            return Result.fail("博客不存在");
        }
        queryReviewUser(review);
        isReviewLiked(review);
        return Result.ok(review);
    }

    @Override
    public Result likeReview(Long id) {
        // 不存在的口碑直接拒绝：否则 update 影响 0 行、Redis 也不写，
        // 接口却返回成功 —— 前端会以为点赞成功了
        if (getById(id) == null) {
            return Result.fail("博客不存在");
        }
        //获取当前登陆用户
        Long userId = UserHolder.getUser().getId();
        //判断当前用户时候点赞
        String key = RedisConstants.REVIEW_LIKED_KEY + id;
        Double score = stringRedisTemplate.opsForZSet().score(key,userId.toString());
        if (score==null) {
            //如果未点赞 可以点赞
            //写数据库
            boolean isSuccess = update().setSql("liked=liked+1").eq("id", id).update();
            //保存数据到redis
            if (isSuccess){
                stringRedisTemplate.opsForZSet().add(key,userId.toString(),System.currentTimeMillis());
            }
        } else {
            //如果已经点赞 取消点赞
            boolean isSuccess = update().setSql("liked=liked-1").eq("id", id).update();
            //数据库-1
            if (isSuccess){
                stringRedisTemplate.opsForZSet().remove(key,userId.toString());
            }
            //redis删除数据
        }
        return Result.ok();
    }

    @Override
    public Result queryReviewLikesById(Long id) {
        String key = RedisConstants.REVIEW_LIKED_KEY + id;
        //查询top5的点赞用户（range 两端都闭，0..4 才是 5 个）
        Set<String> top5 = stringRedisTemplate.opsForZSet().range(key, 0, 4);
        if (top5==null||top5.isEmpty()){
            return Result.ok(Collections.emptyList());
        }
        //解析出用户id
        List<Long> userIds = top5.stream().map(Long::valueOf).collect(Collectors.toList());
        String join = StrUtil.join(",", userIds);
        //根据id查询用户
        List<UserDTO> userDTOS = userService.lambdaQuery()
                .in(User::getId,userIds)
                .last("order by field(id,"+join+")")
                .list()
                .stream().map(user ->
                BeanUtil.copyProperties(user, UserDTO.class)
        ).collect(Collectors.toList());
        //返回
        return Result.ok(userDTOS);
    }

    @Override
    public Result saveReview(Review review) {
        if (review == null) {
            return Result.fail("参数错误");
        }
        if (review.getCarId() == null) {
            return Result.fail("请选择车源");
        }
        if (StrUtil.isBlank(review.getTitle())) {
            return Result.fail("标题不能为空");
        }
        if (StrUtil.isBlank(review.getContent())) {
            return Result.fail("内容不能为空");
        }

        // 获取登录用户
        UserDTO user = UserHolder.getUser();
        review.setUserId(user.getId());
        // 客户端传来的 id / 点赞数 / 评论数一律不采信。
        // 不清 id 会让 save 退化成「按客户端给的 id 插入」，可以伪造主键。
        review.setId(null);
        review.setLiked(0);
        review.setComments(0);
        if (review.getImages() == null) {
            // 数据库该列 NOT NULL：空数组要落成空串
            review.setImages("");
        }
        // 保存探店博文
        boolean isSuccess = save(review);
        if (!isSuccess){
            return Result.fail("新增笔记失败");
        }
        //查询笔记作者的所有粉丝
        List<Follow> follows = followService.lambdaQuery()
                .eq(Follow::getFollowUserId, user.getId())
                .list();
        //推送笔记给所有粉丝
        for (Follow follow : follows) {
            Long userId = follow.getUserId();
            //推送
            String key="feed:"+userId;
            stringRedisTemplate.opsForZSet().add(key,review.getId().toString(),System.currentTimeMillis());
        }
        // 返回id
        return Result.ok(review.getId());
    }
    @Override
    public Result queryReviewOfFollow(Long max, Integer offset) {
        //获取当前用户
        UserDTO user = UserHolder.getUser();
        //查询收件箱。页大小用 DEFAULT_PAGE_SIZE(5) 而不是教程里硬编码的 2 ——
        //一页两条在界面上根本读不出「这是一条流」。
        String key="feed:"+user.getId();
        Set<ZSetOperations.TypedTuple<String>> typedTuples = stringRedisTemplate.opsForZSet()
                .reverseRangeByScoreWithScores(key, 0, max, offset, SystemConstants.DEFAULT_PAGE_SIZE);
        //非空判断
        if (typedTuples==null||typedTuples.isEmpty()){
            return Result.ok();
        }
        //解析数据 reviewId minTime offset
        List<Long> ids=new ArrayList<>(typedTuples.size());
        long minTime =0;
        int os=1;
        for (ZSetOperations.TypedTuple<String> typedTuple : typedTuples) {
            //获取id
            String reviewId = typedTuple.getValue();
            ids.add(Long.valueOf(reviewId));
            long time = typedTuple.getScore().longValue();
            if (time==minTime){
                os++;
            }else {
                minTime = time;
                os=1;
            }
        }
        //根据 查询review
        List<Review> reviews=new ArrayList<>(ids.size());
        for (Long id : ids) {
            Review review = getById(id);
            // 作者删了口碑但收件箱还留着 id：跳过，不要让 null 进列表
            if (review == null) {
                continue;
            }
            queryReviewUser(review);
            isReviewLiked(review);
            reviews.add(review);
        }
        //封装 返回
        ScrollResult scrollResult = new ScrollResult();
        scrollResult.setList(reviews);
        scrollResult.setOffset(os);
        scrollResult.setMinTime(minTime);
        return Result.ok(scrollResult);
    }

    @Override
    public Result queryMyReview(Integer current) {
        UserDTO user = UserHolder.getUser();
        return queryReviewOfUser(current, user.getId());
    }

    @Override
    public Result queryReviewOfUser(Integer current, Long userId) {
        Page<Review> page = query()
                .eq("user_id", userId)
                .orderByDesc("create_time")
                .orderByDesc("id")
                .page(new Page<>(current, SystemConstants.MAX_PAGE_SIZE));
        List<Review> records = page.getRecords();
        records.forEach(review -> {
            queryReviewUser(review);
            isReviewLiked(review);
        });
        return Result.ok(records);
    }

    private void queryReviewUser(Review review) {
        Long userId = review.getUserId();
        User user = userService.getById(userId);
        if (user == null) {
            // 作者注销了：保留口碑本身，昵称/头像留空（前端用首字母/空头像兜底）
            review.setName("");
            review.setIcon("");
            return;
        }
        review.setName(user.getNickName());
        review.setIcon(user.getIcon());
    }
    private void isReviewLiked(Review review) {
        //获取当前登陆用户
        UserDTO user = UserHolder.getUser();
        if (user==null){
            return;
        }
        Long userId = user.getId();
        //判断当前用户时候点赞
        String key = RedisConstants.REVIEW_LIKED_KEY + review.getId();
        Double score = stringRedisTemplate.opsForZSet().score(key, userId.toString());
        review.setIsLike(score!=null);
    }

}
