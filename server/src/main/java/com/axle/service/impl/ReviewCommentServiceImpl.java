package com.axle.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.axle.entity.ReviewComment;
import com.axle.mapper.ReviewCommentMapper;
import com.axle.service.IReviewCommentService;
import org.springframework.stereotype.Service;

/**
 * <p>
 *  服务实现类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
@Service
public class ReviewCommentServiceImpl extends ServiceImpl<ReviewCommentMapper, ReviewComment> implements IReviewCommentService {

}
