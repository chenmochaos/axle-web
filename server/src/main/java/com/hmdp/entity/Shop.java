package com.hmdp.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.experimental.Accessors;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * <p>
 * 
 * </p>
 *
 * @author 虎哥
 * @since 2021-12-22
 */
@Data
@EqualsAndHashCode(callSuper = false)
@Accessors(chain = true)
@TableName("tb_shop")
public class Shop implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 主键
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 商铺名称
     */
    private String name;

    /**
     * 商铺类型的id
     */
    private Long typeId;

    /**
     * 商铺图片，多个图片以','隔开
     */
    private String images;

    /**
     * 商圈，例如陆家嘴
     */
    private String area;

    /**
     * 地址
     */
    private String address;

    /**
     * 经度
     */
    private Double x;

    /**
     * 维度
     */
    private Double y;

    /**
     * 均价，取整数
     */
    private Long avgPrice;

    /**
     * 销量
     */
    private Integer sold;

    /**
     * 评论数量
     */
    private Integer comments;

    /**
     * 评分，1~5分，乘10保存，避免小数
     */
    private Integer score;

    /**
     * 营业时间，例如 10:00-22:00
     */
    private String openHours;

    /* ── 车辆扩展字段（2026-10-16 usedcar.sql 加列）──────────────────────────
     *
     * 表还是 tb_shop、接口路径与响应结构一行没改，只是把「商铺」的语义换成了
     * 「车源」。加列脚本见仓库根目录 usedcar.sql。
     */

    /**
     * 里程（万公里）
     */
    private BigDecimal mileage;

    /**
     * 上牌时间，YYYY-MM
     */
    private String registerDate;

    /**
     * 变速箱：自动 / 手动。摩托车没有这个分类法，为 null
     */
    private String gearbox;

    /**
     * 能源类型：汽油 / 纯电 / 混动
     */
    private String fuel;

    /**
     * 排量，例如 3.0T / 999cc。纯电车为 null
     */
    private String displacement;

    /**
     * 过户次数
     */
    private Integer ownerCount;

    /**
     * 车辆大类：car / motorcycle
     */
    private String kind;

    /**
     * 新车指导价，单位：分（与 avgPrice 同口径）
     */
    private Long originalPrice;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;


    @TableField(exist = false)
    private Double distance;
}
