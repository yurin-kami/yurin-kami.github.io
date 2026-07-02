---
title: "实验六：查找 - 实现代码与测试用例"
date: "2025-11-8"
tags: ["cpp", "折半查找", "二叉排序树", "jikenn"]
excerpt: "kami works"
---

# 实验六：查找 - 实现代码与测试用例

1. 代码实现

   ```cpp
   #include <iostream>
   using namespace std;
   
   #define MAXSIZE 10
   #define OK 1
   
   typedef struct {
       char key; // 关键字域（已改为char类型，解决输入#卡住问题）
   } ElemType;
   
   typedef struct {
       ElemType *R;
       int length;
   } SSTable;
   
   // 初始化顺序表
   int InitList_SSTable(SSTable &L) {
       L.R = new ElemType[MAXSIZE];
       if (!L.R) {
           cout << "初始化错误";
           return 0;
       }
       L.length = 0;
       return OK;
   }
   
   // 插入顺序表（输入10个字符）
   int Insert_SSTable(SSTable &L) {
       cout << "请输入关键字序列(10个字符):" << endl;
       for (int i = 1; i <= MAXSIZE; i++) {
           cin >> L.R[i].key;
           L.length++;
       }
       return 1;
   }
   
   // 折半查找（基于字符的ASCII码进行查找）
   int Search_Bin(SSTable ST, char key) {
       int low = 1, high = ST.length;
       while (low <= high) {
           int mid = (low + high) / 2;
           if (key < ST.R[mid].key)
               high = mid - 1;
           else if (key > ST.R[mid].key)
               low = mid + 1;
           else
               return mid;
       }
       return 0;
   }
   
   // 二叉排序树的节点结构
   typedef struct BSTNode {
       ElemType data;
       BSTNode *lchild, *rchild;
   } BSTNode, *BSTree;
   
   // 二叉排序树的递归查找
   BSTree SearchBST(BSTree T, char key) {
       if (!T || T->data.key == key)
           return T;
       else if (key < T->data.key)
           return SearchBST(T->lchild, key);
       else
           return SearchBST(T->rchild, key);
   }
   
   // 二叉排序树的插入
   void InsertBST(BSTree &T, ElemType e) {
       if (!T) {
           T = new BSTNode;
           T->data = e;
           T->lchild = T->rchild = NULL;
       } else if (e.key < T->data.key)
           InsertBST(T->lchild, e);
       else if (e.key > T->data.key)
           InsertBST(T->rchild, e);
       // 如果相等，不插入
   }
   
   // 二叉排序树的创建
   void CreateBST(BSTree &T) {
       T = NULL;
       ElemType e;
       cout << "请输入若干字符(以#结束输入):" << endl;
       cin >> e.key;  // 正确读取字符
       while (e.key != '#') {
           InsertBST(T, e);
           cin >> e.key;
       }
   }
   
   // 二叉排序树的删除
   void DeleteBST(BSTree &T, char key) {
       BSTree p = T, f = NULL;
       BSTree q, s;
       
       // 查找关键字为key的节点
       while (p) {
           if (p->data.key == key)
               break;
           f = p;
           if (key < p->data.key)
               p = p->lchild;
           else
               p = p->rchild;
       }
       
       if (!p) // 未找到
           return;
       
       // 如果要删除的节点是叶子节点
       if (!p->lchild && !p->rchild) {
           if (!f)
               T = NULL;
           else if (f->lchild == p)
               f->lchild = NULL;
           else
               f->rchild = NULL;
           delete p;
       }
       // 如果要删除的节点只有左子树
       else if (!p->rchild) {
           if (!f)
               T = p->lchild;
           else if (f->lchild == p)
               f->lchild = p->lchild;
           else
               f->rchild = p->lchild;
           delete p;
       }
       // 如果要删除的节点只有右子树
       else if (!p->lchild) {
           if (!f)
               T = p->rchild;
           else if (f->lchild == p)
               f->lchild = p->rchild;
           else
               f->rchild = p->rchild;
           delete p;
       }
       // 如果要删除的节点有左右子树
       else {
           s = p;
           q = p->lchild;
           while (q->rchild) {
               s = q;
               q = q->rchild;
           }
           p->data = q->data;
           if (s == p)
               p->lchild = q->lchild;
           else
               s->rchild = q->lchild;
           delete q;
       }
   }
   
   // 中序遍历
   void InOrderTraverse(BSTree T) {
       if (T) {
           InOrderTraverse(T->lchild);
           cout << T->data.key << " ";
           InOrderTraverse(T->rchild);
       }
   }
   
   // 显示结果
   void Show_End(int result, char testkey) {
       if (result == 0)
           cout << "未找到" << testkey << endl;
       else
           cout << "找到" << testkey << "位置为" << result << endl;
   }
   
   int main() {
       // 折半查找测试
       SSTable ST;
       InitList_SSTable(ST);
       Insert_SSTable(ST);
       
       char testkey;
       cout << "请输入要查找的关键字（字符）：" << endl;
       cin >> testkey;
       
       int result;
       result = Search_Bin(ST, testkey);
       Show_End(result, testkey);
       
       // 二叉排序树测试
       BSTree T;
       cout << "请输入若干字符(以#结束输入):" << endl;
       CreateBST(T);
       
       cout << "当前有序二叉树中序遍历结果为:" << endl;
       InOrderTraverse(T);
       cout << endl;
       
       char key;
       cout << "请输入待查找字符:" << endl;
       cin >> key;
       BSTree resultBST = SearchBST(T, key);
       if (resultBST) {
           cout << "找到字符" << key << endl;
       } else {
           cout << "未找到" << key << endl;
       }
       
       cout << "请输入待删除的字符:" << endl;
       cin >> key;
       DeleteBST(T, key);
       
       cout << "当前有序二叉树中序遍历结果为:" << endl;
       InOrderTraverse(T);
       cout << endl;
       
       system("pause");
       return 0;
   }
   ```

2. 运行测试用例

   ![image-20251108232912891](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/image-20251108232912891.png)