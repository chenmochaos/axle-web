package com.axle.service.impl;

import cn.hutool.core.bean.BeanUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.axle.dto.Result;
import com.axle.dto.UserDTO;
import com.axle.entity.Follow;
import com.axle.entity.User;
import com.axle.mapper.FollowMapper;
import com.axle.service.IFollowService;
import com.axle.service.IUserService;
import com.axle.utils.RedisConstants;
import com.axle.utils.UserHolder;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * <p>
 *  服务实现类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
@Service
public class FollowServiceImpl extends ServiceImpl<FollowMapper, Follow> implements IFollowService {
    @Resource
    private StringRedisTemplate stringRedisTemplate;
    @Resource
    private IUserService userService;

    @Override
    public Result follow(Long followUserId, Boolean isFollow) {
        //获取登陆用户
        Long id = UserHolder.getUser().getId();
        // 关注自己没有意义，而且会让「粉丝数」与「关注数」同时 +1，数字看起来像 bug
        if (id.equals(followUserId)) {
            return Result.fail("不能关注自己");
        }
        String key = "follows:" + id;
        //判断是关注还是取关
        if (isFollow) {
            // 重复关注不再插一行：tb_follow 没有唯一索引，插两次会让粉丝数翻倍，
            // 取关时又把两行一起删掉，前后数字对不上
            long count = lambdaQuery()
                    .eq(Follow::getUserId, id)
                    .eq(Follow::getFollowUserId, followUserId)
                    .count();
            if (count == 0) {
                Follow follow = new Follow();
                follow.setFollowUserId(followUserId);
                follow.setUserId(id);
                save(follow);
            }
            // Redis 是查询走的那一侧，历史数据里可能缺位，这里无条件补齐
            stringRedisTemplate.opsForSet().add(key, followUserId.toString());
        }else {
            //取关 删除
            remove(new LambdaQueryWrapper<Follow>()
                    .eq(Follow::getUserId, id)
                    .eq(Follow::getFollowUserId, followUserId)
            );
            // ⚠️ 必须传 String：StringRedisTemplate 的 key/value 都是字符串序列化，
            // 传 Long 会在运行期抛 ClassCastException（取关接口一直是 500 的原因）
            stringRedisTemplate.opsForSet().remove(key, followUserId.toString());
        }
        return Result.ok();
    }

    @Override
    public Result isFollow(Long followUserId) {
        //获取登陆用户
        Long id = UserHolder.getUser().getId();
        //查询是否关注
        Long count = lambdaQuery()
                .eq(Follow::getUserId, id)
                .eq(Follow::getFollowUserId, followUserId)
                .count();
        return Result.ok(count>0);
    }

    @Override
    public Result followCommons(Long id) {
        //获取登陆用户
        Long userId = UserHolder.getUser().getId();
        String key="follows:"+userId;
        //求交集
        String key2="follows:"+id;
        Set<String> intersect = stringRedisTemplate.opsForSet().intersect(key, key2);
        if (intersect==null||intersect.isEmpty()) {
            return Result.ok(Collections.emptyList());
        }
        //解析出id
        List<Long> ids = intersect.stream().map(Long::valueOf).collect(Collectors.toList());
        //查询用户
        List<User> users = userService.listByIds(ids);
        List<UserDTO> collect = users.stream()
                .map(user -> BeanUtil.copyProperties(user, UserDTO.class))
                .collect(Collectors.toList());
        return Result.ok(collect);
    }
}
