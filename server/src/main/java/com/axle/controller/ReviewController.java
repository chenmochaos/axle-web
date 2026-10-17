package com.axle.controller;


import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.axle.dto.Result;
import com.axle.dto.UserDTO;
import com.axle.entity.Review;
import com.axle.entity.User;
import com.axle.service.IReviewService;
import com.axle.service.IUserService;
import com.axle.utils.SystemConstants;
import com.axle.utils.UserHolder;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.List;

/**
 * <p>
 * 前端控制器
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
@RestController
@RequestMapping("/review")
public class ReviewController {

    @Resource
    private IReviewService reviewService;

    @PostMapping
    public Result saveReview(@RequestBody Review review) {
        return reviewService.saveReview(review);
    }

    @PutMapping("/like/{id}")
    public Result likeReview(@PathVariable("id") Long id) {
        // 修改点赞数量
        return reviewService.likeReview(id);
    }

    @GetMapping("/of/me")
    public Result queryMyReview(@RequestParam(value = "current", defaultValue = "1") Integer current) {
        // 获取登录用户
        UserDTO user = UserHolder.getUser();
        // 根据用户查询
        Page<Review> page = reviewService.query()
                .eq("user_id", user.getId()).page(new Page<>(current, SystemConstants.MAX_PAGE_SIZE));
        // 获取当前页数据
        List<Review> records = page.getRecords();
        return Result.ok(records);
    }

    @GetMapping("/hot")
    public Result queryHotReview(@RequestParam(value = "current", defaultValue = "1") Integer current) {
        return reviewService.queryHotReview(current);
    }

    @GetMapping("/{id}")
    public Result queryReviewById(@PathVariable("id") Long id) {
        return reviewService.queryReviewById(id);
    }
    @GetMapping("/likes/{id}")
    public Result queryReviewLikesById(@PathVariable("id") Long id) {
        return reviewService.queryReviewLikesById(id);
    }

    @GetMapping("/of/user")
    public Result queryReviewByUserId(@RequestParam(value = "current",defaultValue = "1")Integer current,
                                    @RequestParam("id")Long id){
        Page<Review> page = reviewService.query().eq("user_id", id)
                .page(new Page<>(current, SystemConstants.MAX_PAGE_SIZE));

        List<Review> records = page.getRecords();
        return Result.ok(records);
    }
    @GetMapping("/of/follow")
    public Result queryReviewOfFollow(@RequestParam("lastId")Long max,@RequestParam(value = "offset",defaultValue = "0")Integer offset){
        return reviewService.queryReviewOfFollow(max,offset);
    }
}
