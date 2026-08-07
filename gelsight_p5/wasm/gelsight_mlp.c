#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <wasm_simd128.h>

#define IN_FEATURES 5
#define HIDDEN 64
#define OUT_FEATURES 2
#define WEIGHT_COUNT 8834
#define MAX_NORMAL_XY 0.995f
#define MIN_NORMAL_Z 0.01f

static float g_weights[WEIGHT_COUNT];
static int g_weights_loaded = 0;

static inline float dot64_simd(const float *a, const float *b) {
  v128_t acc0 = wasm_f32x4_splat(0.0f);
  v128_t acc1 = wasm_f32x4_splat(0.0f);
  v128_t acc2 = wasm_f32x4_splat(0.0f);
  v128_t acc3 = wasm_f32x4_splat(0.0f);

  for (int k = 0; k < HIDDEN; k += 16) {
    const v128_t av0 = wasm_v128_load(a + k);
    const v128_t bv0 = wasm_v128_load(b + k);
    acc0 = wasm_f32x4_add(acc0, wasm_f32x4_mul(av0, bv0));

    const v128_t av1 = wasm_v128_load(a + k + 4);
    const v128_t bv1 = wasm_v128_load(b + k + 4);
    acc1 = wasm_f32x4_add(acc1, wasm_f32x4_mul(av1, bv1));

    const v128_t av2 = wasm_v128_load(a + k + 8);
    const v128_t bv2 = wasm_v128_load(b + k + 8);
    acc2 = wasm_f32x4_add(acc2, wasm_f32x4_mul(av2, bv2));

    const v128_t av3 = wasm_v128_load(a + k + 12);
    const v128_t bv3 = wasm_v128_load(b + k + 12);
    acc3 = wasm_f32x4_add(acc3, wasm_f32x4_mul(av3, bv3));
  }

  v128_t sum = wasm_f32x4_add(wasm_f32x4_add(acc0, acc1),
                              wasm_f32x4_add(acc2, acc3));
  return wasm_f32x4_extract_lane(sum, 0) + wasm_f32x4_extract_lane(sum, 1) +
         wasm_f32x4_extract_lane(sum, 2) + wasm_f32x4_extract_lane(sum, 3);
}

static inline void clamp_normal_xy(float *nx, float *ny) {
  if (!isfinite(*nx)) {
    *nx = 0.0f;
  }
  if (!isfinite(*ny)) {
    *ny = 0.0f;
  }

  const float norm_sq = *nx * *nx + *ny * *ny;
  const float max_norm_sq = MAX_NORMAL_XY * MAX_NORMAL_XY;
  if (isfinite(norm_sq) && norm_sq > max_norm_sq) {
    const float scale = MAX_NORMAL_XY / sqrtf(norm_sq);
    *nx *= scale;
    *ny *= scale;
  } else if (!isfinite(norm_sq)) {
    *nx = 0.0f;
    *ny = 0.0f;
  }
}

int mlp_get_weight_count(void) { return WEIGHT_COUNT; }

static float fp16_to_fp32(uint16_t half) {
  const uint32_t sign = ((uint32_t)half & 0x8000u) << 16;
  uint32_t exponent = ((uint32_t)half >> 10) & 0x1fu;
  uint32_t mantissa = (uint32_t)half & 0x03ffu;
  uint32_t bits;

  if (exponent == 0) {
    if (mantissa == 0) {
      bits = sign;
    } else {
      exponent = 127u - 15u + 1u;
      while ((mantissa & 0x0400u) == 0) {
        mantissa <<= 1;
        exponent -= 1;
      }
      mantissa &= 0x03ffu;
      bits = sign | (exponent << 23) | (mantissa << 13);
    }
  } else if (exponent == 0x1fu) {
    bits = sign | 0x7f800000u | (mantissa << 13);
  } else {
    bits = sign | ((exponent + (127u - 15u)) << 23) | (mantissa << 13);
  }

  union {
    uint32_t u;
    float f;
  } value;
  value.u = bits;
  return value.f;
}

int mlp_load(const float *weights, int count) {
  if (!weights || count != WEIGHT_COUNT) {
    g_weights_loaded = 0;
    return 0;
  }

  for (int i = 0; i < WEIGHT_COUNT; i += 1) {
    g_weights[i] = weights[i];
  }
  g_weights_loaded = 1;
  return 1;
}

int mlp_load_f16(const uint16_t *weights, int count) {
  if (!weights || count != WEIGHT_COUNT) {
    g_weights_loaded = 0;
    return 0;
  }

  for (int i = 0; i < WEIGHT_COUNT; i += 1) {
    g_weights[i] = fp16_to_fp32(weights[i]);
  }
  g_weights_loaded = 1;
  return 1;
}

void mlp_run(const float *features, float *normal_xy, int pixels) {
  if (!g_weights_loaded || !features || !normal_xy || pixels <= 0) {
    return;
  }

  const float *w1 = g_weights;
  const float *b1 = w1 + HIDDEN * IN_FEATURES;
  const float *w2 = b1 + HIDDEN;
  const float *b2 = w2 + HIDDEN * HIDDEN;
  const float *w3 = b2 + HIDDEN;
  const float *b3 = w3 + HIDDEN * HIDDEN;
  const float *w4 = b3 + HIDDEN;
  const float *b4 = w4 + OUT_FEATURES * HIDDEN;

  float h1[HIDDEN];
  float h2[HIDDEN];
  float h3[HIDDEN];

  for (int p = 0; p < pixels; p += 1) {
    const float *x = features + p * IN_FEATURES;

    for (int j = 0; j < HIDDEN; j += 1) {
      const float *w = w1 + j * IN_FEATURES;
      float sum = b1[j] + x[0] * w[0] + x[1] * w[1] + x[2] * w[2] +
                  x[3] * w[3] + x[4] * w[4];
      h1[j] = sum > 0.0f ? sum : 0.0f;
    }

    for (int j = 0; j < HIDDEN; j += 1) {
      const float *w = w2 + j * HIDDEN;
      float sum = b2[j] + dot64_simd(h1, w);
      h2[j] = sum > 0.0f ? sum : 0.0f;
    }

    for (int j = 0; j < HIDDEN; j += 1) {
      const float *w = w3 + j * HIDDEN;
      float sum = b3[j] + dot64_simd(h2, w);
      h3[j] = sum > 0.0f ? sum : 0.0f;
    }

    for (int j = 0; j < OUT_FEATURES; j += 1) {
      const float *w = w4 + j * HIDDEN;
      float sum = b4[j] + dot64_simd(h3, w);
      normal_xy[p * OUT_FEATURES + j] = sum;
    }
  }
}

void mlp_run_gradients(const float *features, float *gx, float *gy,
                       int pixels) {
  if (!g_weights_loaded || !features || !gx || !gy || pixels <= 0) {
    return;
  }

  const float *w1 = g_weights;
  const float *b1 = w1 + HIDDEN * IN_FEATURES;
  const float *w2 = b1 + HIDDEN;
  const float *b2 = w2 + HIDDEN * HIDDEN;
  const float *w3 = b2 + HIDDEN;
  const float *b3 = w3 + HIDDEN * HIDDEN;
  const float *w4 = b3 + HIDDEN;
  const float *b4 = w4 + OUT_FEATURES * HIDDEN;

  float h1[HIDDEN];
  float h2[HIDDEN];
  float h3[HIDDEN];
  float nz_sum = 0.0f;
  int nz_count = 0;

  for (int p = 0; p < pixels; p += 1) {
    const float *x = features + p * IN_FEATURES;

    for (int j = 0; j < HIDDEN; j += 1) {
      const float *w = w1 + j * IN_FEATURES;
      float sum = b1[j] + x[0] * w[0] + x[1] * w[1] + x[2] * w[2] +
                  x[3] * w[3] + x[4] * w[4];
      h1[j] = sum > 0.0f ? sum : 0.0f;
    }

    for (int j = 0; j < HIDDEN; j += 1) {
      const float *w = w2 + j * HIDDEN;
      float sum = b2[j] + dot64_simd(h1, w);
      h2[j] = sum > 0.0f ? sum : 0.0f;
    }

    for (int j = 0; j < HIDDEN; j += 1) {
      const float *w = w3 + j * HIDDEN;
      float sum = b3[j] + dot64_simd(h2, w);
      h3[j] = sum > 0.0f ? sum : 0.0f;
    }

    float nx = b4[0] + dot64_simd(h3, w4);
    float ny = b4[1] + dot64_simd(h3, w4 + HIDDEN);
    clamp_normal_xy(&nx, &ny);

    gx[p] = nx;
    gy[p] = ny;

    const float nz = sqrtf(fmaxf(MIN_NORMAL_Z * MIN_NORMAL_Z,
                                 1.0f - nx * nx - ny * ny));
    if (isfinite(nz)) {
      nz_sum += nz;
      nz_count += 1;
    }
  }

  float mean_nz = nz_count > 0 ? nz_sum / (float)nz_count : 1.0f;
  if (!isfinite(mean_nz) || mean_nz < MIN_NORMAL_Z) {
    mean_nz = MIN_NORMAL_Z;
  }
  for (int p = 0; p < pixels; p += 1) {
    float nx = gx[p];
    float ny = gy[p];
    clamp_normal_xy(&nx, &ny);
    gx[p] = nx;
    gy[p] = ny;
    float nz = sqrtf(fmaxf(MIN_NORMAL_Z * MIN_NORMAL_Z,
                           1.0f - nx * nx - ny * ny));
    if (!isfinite(nz) || nz < MIN_NORMAL_Z) {
      nz = mean_nz;
    }
    gx[p] = -nx / nz;
    gy[p] = -ny / nz;
    if (!isfinite(gx[p])) {
      gx[p] = 0.0f;
    }
    if (!isfinite(gy[p])) {
      gy[p] = 0.0f;
    }
  }
}

void mlp_run_gradients_unchecked(const float *features, float *gx, float *gy,
                                 int pixels) {
  if (!g_weights_loaded || !features || !gx || !gy || pixels <= 0) {
    return;
  }

  const float *w1 = g_weights;
  const float *b1 = w1 + HIDDEN * IN_FEATURES;
  const float *w2 = b1 + HIDDEN;
  const float *b2 = w2 + HIDDEN * HIDDEN;
  const float *w3 = b2 + HIDDEN;
  const float *b3 = w3 + HIDDEN * HIDDEN;
  const float *w4 = b3 + HIDDEN;
  const float *b4 = w4 + OUT_FEATURES * HIDDEN;

  float h1[HIDDEN];
  float h2[HIDDEN];
  float h3[HIDDEN];

  for (int p = 0; p < pixels; p += 1) {
    const float *x = features + p * IN_FEATURES;

    for (int j = 0; j < HIDDEN; j += 1) {
      const float *w = w1 + j * IN_FEATURES;
      float sum = b1[j] + x[0] * w[0] + x[1] * w[1] + x[2] * w[2] +
                  x[3] * w[3] + x[4] * w[4];
      h1[j] = sum > 0.0f ? sum : 0.0f;
    }

    for (int j = 0; j < HIDDEN; j += 1) {
      const float *w = w2 + j * HIDDEN;
      float sum = b2[j] + dot64_simd(h1, w);
      h2[j] = sum > 0.0f ? sum : 0.0f;
    }

    for (int j = 0; j < HIDDEN; j += 1) {
      const float *w = w3 + j * HIDDEN;
      float sum = b3[j] + dot64_simd(h2, w);
      h3[j] = sum > 0.0f ? sum : 0.0f;
    }

    const float nx = b4[0] + dot64_simd(h3, w4);
    const float ny = b4[1] + dot64_simd(h3, w4 + HIDDEN);
    const float nz = sqrtf(1.0f - nx * nx - ny * ny);
    gx[p] = -nx / nz;
    gy[p] = -ny / nz;
  }
}
