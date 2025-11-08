---
title: "使用c++编写代码使用施密特正交化"
date: "2025-11-8"
tags: ["cpp", "Schimidt", "homeworks", "baseful"]
excerpt: "kami works"
---

# 使用c++编写代码使用施密特正交化

#### 编程实现施密特（Schimidt）正交化过程，并找一个实例验证对错

##### 原理

![schimidit](https://p.ananas.chaoxing.com/star3/origin/38be7a4511811e1aa816491797dfa5e4.png)

- 实现代码

  ```cpp
  #include <iostream>
  #include <vector>
  #include <cmath>
  
  using namespace std;
  
  // 向量内积
  double dotProduct(const vector<double> &u, const vector<double> &v)
  {
      double sum = 0.0;
      for (size_t i = 0; i < u.size(); ++i)
      {
          sum += u[i] * v[i];
      }
      return sum;
  }
  
  // 向量减法
  vector<double> vectorSubtract(const vector<double> &u, const vector<double> &v)
  {
      vector<double> result(u.size());
      for (size_t i = 0; i < u.size(); ++i)
      {
          result[i] = u[i] - v[i];
      }
      return result;
  }
  
  // 向量数乘
  vector<double> scalarMultiplication(double scalar, const vector<double> &v)
  {
      vector<double> result(v.size());
      for (size_t i = 0; i < v.size(); ++i)
      {
          result[i] = scalar * v[i];
      }
      return result;
  }
  
  // Schmidt正交化
  vector<vector<double>> schmidtOrthogonalization(const vector<vector<double>> &vectors)
  {
      size_t n = vectors.size();
      vector<vector<double>> orthogonalVectors;
      orthogonalVectors.push_back(vectors[0]);
  
      for (size_t i = 1; i < n; ++i)
      {
          vector<double> b_i = vectors[i];
          for (size_t j = 0; j < i; ++j)
          {
              double coefficient = dotProduct(vectors[i], orthogonalVectors[j]) / dotProduct(orthogonalVectors[j], orthogonalVectors[j]);
              b_i = vectorSubtract(b_i, scalarMultiplication(coefficient, orthogonalVectors[j]));
          }
          orthogonalVectors.push_back(b_i);
      }
      return orthogonalVectors;
  }
  
  // print vectors
  void printVectors(const vector<vector<double>> &vectors)
  {
      for (const auto &vec : vectors)
      {
          for (const auto &val : vec)
          {
              cout << val << "\t";
          }
          cout << endl;
      }
  }
  
  int main()
  {
      // 示例向量组
      vector<vector<double>> vectors = {
          {1, 1, 0},
          {0, 1, 0},
          {1, 0, 1}};
  
      // 施密特正交化
      vector<vector<double>> orthogonal_vectors = schmidtOrthogonalization(vectors);
  
      // 输出正交向量组
      cout << "Original Vectors:" << endl;
      printVectors(vectors);
      cout << "Orthogonal Vectors:" << endl;
      printVectors(orthogonal_vectors);
  
      return 0;
  }
  ```

  - 运行测试用例结果

    ![image-20251108174807381](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/image-20251108174807381.png)