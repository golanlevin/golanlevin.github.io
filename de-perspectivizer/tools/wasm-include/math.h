#pragma once
__attribute__((import_module("math"), import_name("sin"))) double sin(double);
__attribute__((import_module("math"), import_name("cos"))) double cos(double);
__attribute__((import_module("math"), import_name("atan2"))) double atan2(double, double);
__attribute__((import_module("math"), import_name("atan"))) double atan(double);
__attribute__((import_module("math"), import_name("exp"))) double exp(double);
__attribute__((import_module("math"), import_name("log"))) double log(double);
__attribute__((import_module("math"), import_name("log10"))) double log10(double);
__attribute__((import_module("math"), import_name("sinh"))) double sinh(double);
__attribute__((import_module("math"), import_name("pow"))) double pow(double, double);
static inline double fabs(double x) { return __builtin_fabs(x); }
static inline double sqrt(double x) { return __builtin_sqrt(x); }
static inline double ceil(double x) { return __builtin_ceil(x); }
static inline double floor(double x) { return __builtin_floor(x); }
