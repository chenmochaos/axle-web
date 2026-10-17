package com.axle.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.StringUtils;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.axle.dto.Result;
import com.axle.entity.Brand;
import com.axle.mapper.BrandMapper;
import com.axle.service.IBrandService;
import com.axle.utils.RedisConstants;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.List;

/**
 * <p>
 *  服务实现类
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
@Service
public class BrandServiceImpl extends ServiceImpl<BrandMapper, Brand> implements IBrandService {
    @Resource
    private StringRedisTemplate stringRedisTemplate;

    @Override
    public Result getTypeList() {
        String typeKey= RedisConstants.CACHE_TYPE_KEY;
        //从redis中查询
        Long typeListSize = stringRedisTemplate.opsForList().size(typeKey);
        //redis存在数据
        if (typeListSize!=null&&typeListSize!=0){
            List<String> typeJsonList = stringRedisTemplate.opsForList().range(typeKey, 0, typeListSize-1);
            List<Brand> typeList=new ArrayList<>();
            for (String typeJson : typeJsonList) {
                typeList.add(JSONUtil.toBean(typeJson,Brand.class));
            }
            return Result.ok(typeList);
        }
        //redis不存在数据 查询数据库
        List<Brand> typeList = query().orderByAsc("sort").list();
        if (typeList==null){
            //数据库不存在数据
            return Result.fail("发生错误");
        }
        //转换
        List<String> typeJsonList=new ArrayList<>();
        for (Brand brand : typeList) {
            typeJsonList.add(JSONUtil.toJsonStr(brand));
        }
        //数据库存在数据 写入redis
        stringRedisTemplate.opsForList().rightPushAll(typeKey,typeJsonList);
        //返回数据
        return Result.ok(typeList);
    }
}
