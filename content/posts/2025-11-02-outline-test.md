---
title: "测试大纲功能的文章"
date: "2025-11-02"
tags: ["测试", "大纲"]
excerpt: "这是一篇用于测试大纲功能的文章"
---

# 引言

这是用于测试大纲功能的文章。

## 第一章

第一章的内容。

_jikenn4.cpp_

```cpp
#include <iostream>
#include <string>
#include <climits>
#include <vector>
#include <cctype>
using namespace std;

// 二叉树节点：data 改为 string，支持多位数和负数
typedef struct BiTNode {
    string data;                    // 改为 string
    struct BiTNode *lchild, *rchild;
} BiTNode, *BiTree;

// 链栈（用于非递归遍历）
typedef struct StackNode {
    BiTree data;
    struct StackNode *next;
} StackNode, *LinkStack;

// 字符栈（用于运算符）
typedef struct {
    char *base;
    char *top;
    int stacksize;
} SqStack;

// 树栈（用于表达式树节点）
typedef struct {
    BiTree *base;
    BiTree *top;
    int stacksize;
} BiTreeStack;

// 哈夫曼树节点（不变）
typedef struct {
    char data;
    int weight;
    int parent, lchild, rchild;
} HuffmanNode;

typedef struct {
    HuffmanNode *nodes;
    int n;
} HuffmanTree;

// ========== 链栈函数（不变）==========
void InitStack(LinkStack &S) { S = nullptr; }
bool StackEmpty(LinkStack S) { return S == nullptr; }
void Push(LinkStack &S, BiTree e) {
    StackNode *p = new StackNode;
    p->data = e;
    p->next = S;
    S = p;
}
void Pop(LinkStack &S, BiTree &e) {
    if (S) {
        e = S->data;
        LinkStack p = S;
        S = S->next;
        delete p;
    }
}
BiTree GetTop(LinkStack S) { return S ? S->data : nullptr; }

// ========== 字符栈函数（不变）==========
void InitStack(SqStack &S) {
    S.base = new char[100];
    S.top = S.base;
    S.stacksize = 100;
}
void Push(SqStack &S, char e) {
    if (S.top - S.base < S.stacksize)
        *S.top++ = e;
}
void Pop(SqStack &S, char &e) {
    if (S.top > S.base)
        e = *--S.top;
}
char GetTop(SqStack &S) {
    return S.top > S.base ? *(S.top - 1) : '\0';
}

// ========== 树栈函数（不变）==========
void InitBiTreeStack(BiTreeStack &S, int size = 100) {
    S.base = new BiTree[size];
    S.top = S.base;
    S.stacksize = size;
}
void PushBiTree(BiTreeStack &S, BiTree e) {
    if (S.top - S.base < S.stacksize)
        *S.top++ = e;
}
void PopBiTree(BiTreeStack &S, BiTree &e) {
    if (S.top > S.base)
        e = *--S.top;
}
BiTree GetTopBiTree(BiTreeStack S) {
    return S.top > S.base ? *(S.top - 1) : nullptr;
}

// ========== 表达式相关辅助函数 ==========
bool isOperator(char c) {
    return c == '+' || c == '-' || c == '*' || c == '/' || c == '(' || c == ')' || c == '#';
}

// 判断当前 '-' 是否为负号（而非减号）
bool isNegativeSign(const string& expr, size_t pos) {
    if (expr[pos] != '-') return false;
    if (pos == 0) return true; // 开头的 -
    char prev = expr[pos - 1];
    return prev == '(' || prev == '+' || prev == '-' || prev == '*' || prev == '/';
}

// 运算符优先级比较
char Precede(char t1, char t2) {
    // 标准算符优先级比较，返回 '<'（栈顶优先级低，应入栈），'>'（栈顶优先级高，应出栈），'='（匹配，如 () 或 ##）
    auto prec = [](char c) -> int {
        if (c == '+' || c == '-') return 1;
        if (c == '*' || c == '/') return 2;
        return 0; // '(' 或 '#' 返回 0
    };

    // 特殊匹配情况
    if (t1 == '#' && t2 == '#') return '=';
    if (t1 == '(' && t2 == ')') return '=';

    // 当遇到左括号或栈顶为'#'且非结束时，优先入栈
    if (t2 == '(') return '<';
    if (t1 == '(') return '<';
    if (t1 == '#') return '<';
    if (t2 == '#') return '>';

    int p1 = prec(t1);
    int p2 = prec(t2);
    if (p1 < p2) return '<';
    else return '>'; // 相等或 p1>p2 时（左结合），栈顶先出栈
}

// 计算 a theta b
int GetValue(const string& theta, int a, int b) {
    char op = theta[0];
    switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/':
            if (b == 0) {
                cout << "\n错误：除零！" << endl;
                return 0;
            }
            return a / b;
        default: return 0;
    }
}

// 创建表达式树节点
void CreateExpTree(BiTree &T, BiTree a, BiTree b, const string& ch) {
    T = new BiTNode{ch, a, b};
}

// 解析整数（包括负数）
string parseNumber(const string& expr, size_t& i) {
    string num = "";
    if (i < expr.size() && expr[i] == '-') {
        num += '-';
        i++;
    }
    while (i < expr.size() && isdigit(expr[i])) {
        num += expr[i];
        i++;
    }
    return num;
}

// ✅ 修复后的表达式树构建函数
void InitExpTree(BiTree &T, const string& expr) {
    SqStack OPTR;
    BiTreeStack EXPT;
    InitStack(OPTR);
    Push(OPTR, '#');
    InitBiTreeStack(EXPT);

    size_t i = 0;
    char ch = expr[i];

    // 使用经典算法：当 栈顶 != '#' 或 当前字符 != '#' 时继续
    while (ch != '#' || GetTop(OPTR) != '#') {
        // 处理数字（包括负数）
        if (isdigit(ch) || (ch == '-' && isNegativeSign(expr, i))) {
            string num = parseNumber(expr, i);
            CreateExpTree(T, nullptr, nullptr, num);
            PushBiTree(EXPT, T);
            ch = (i < expr.size()) ? expr[i] : '#';
            continue;
        }

        // 处理运算符
        if (isOperator(ch)) {
            char topOp = GetTop(OPTR);
            char relation = Precede(topOp, ch);
            switch (relation) {
                case '<':
                    Push(OPTR, ch);
                    i++;
                    ch = (i < expr.size()) ? expr[i] : '#';
                    break;
                case '=':
                    Pop(OPTR, ch); // 弹出匹配的括号或 #
                    i++;
                    ch = (i < expr.size()) ? expr[i] : '#';
                    break;
                case '>': {
                    // 确保树栈有足够元素
                    if (EXPT.top - EXPT.base < 2) {
                        cout << "\n错误：表达式格式错误（操作数不足）！" << endl;
                        T = nullptr;
                        return;
                    }
                    char op;
                    Pop(OPTR, op); // 弹出运算符
                    BiTree b, a;
                    PopBiTree(EXPT, b);
                    PopBiTree(EXPT, a);
                    CreateExpTree(T, a, b, string(1, op));
                    PushBiTree(EXPT, T);
                    break;
                }
                default:
                    cout << "\n错误：无法识别的优先关系！" << endl;
                    T = nullptr;
                    return;
            }
            continue;
        }

        cout << "\n错误：表达式包含非法字符 '" << ch << "'！" << endl;
        T = nullptr;
        return;
    }

    // 弹出最后的 '#'
    char dummy;
    Pop(OPTR, dummy);

    T = GetTopBiTree(EXPT);
}

// 求值：递归计算表达式树
int EvaluateExTree(BiTree T) {
    if (!T) return 0;
    if (!T->lchild && !T->rchild) {
        try {
            return stoi(T->data);
        } catch (...) {
            cout << "\n错误：无法解析操作数 '" << T->data << "'！" << endl;
            return 0;
        }
    }
    int left = EvaluateExTree(T->lchild);
    int right = EvaluateExTree(T->rchild);
    return GetValue(T->data, left, right);
}

// ========== 二叉树遍历（适配 string data）==========
void InOrderTraverseRecursive(BiTree T) {
    if (T) {
        if (T->lchild || T->rchild) cout << "(";
        InOrderTraverseRecursive(T->lchild);
        cout << T->data;
        InOrderTraverseRecursive(T->rchild);
        if (T->lchild || T->rchild) cout << ")";
    }
}

void InOrderTraverseNonRecursive(BiTree T) {
    // 为简化，此处不实现非递归中序（因 data 是 string，且主要用于表达式）
    cout << "（非递归中序未适配 string，使用递归版）";
    InOrderTraverseRecursive(T);
}

void PostOrderTraverseRecursive(BiTree T) {
    if (T) {
        PostOrderTraverseRecursive(T->lchild);
        PostOrderTraverseRecursive(T->rchild);
        cout << T->data << " ";
    }
}

// ========== 哈夫曼树（不变）==========
void InitHuffmanTree(HuffmanTree &HT, int n) {
    HT.n = n;
    HT.nodes = new HuffmanNode[2 * n];
    for (int i = 0; i < 2 * n; i++) {
        HT.nodes[i] = {'\0', 0, -1, -1, -1};
    }
}

void Select(HuffmanTree &HT, int end, int &s1, int &s2) {
    s1 = s2 = -1;
    int min1 = INT_MAX, min2 = INT_MAX;
    for (int i = 0; i < end; i++) {
        if (HT.nodes[i].parent == -1) {
            if (HT.nodes[i].weight < min1) {
                min2 = min1;
                s2 = s1;
                min1 = HT.nodes[i].weight;
                s1 = i;
            } else if (HT.nodes[i].weight < min2) {
                min2 = HT.nodes[i].weight;
                s2 = i;
            }
        }
    }
}

void CreateHuffmanTreeFromNodes(HuffmanTree &HT, int n) {
    int m = 2 * n - 1;
    for (int i = n; i < m; i++) {
        int s1, s2;
        Select(HT, i, s1, s2);
        HT.nodes[s1].parent = i;
        HT.nodes[s2].parent = i;
        HT.nodes[i].lchild = s1;
        HT.nodes[i].rchild = s2;
        HT.nodes[i].weight = HT.nodes[s1].weight + HT.nodes[s2].weight;
        HT.nodes[i].parent = -1;
    }
}

void HuffmanCode(HuffmanTree &HT, int n, vector<string> &codes) {
    codes.resize(n);
    for (int i = 0; i < n; i++) {
        string code;
        int c = i;
        int p = HT.nodes[c].parent;
        while (p != -1) {
            if (HT.nodes[p].lchild == c)
                code = "0" + code;
            else
                code = "1" + code;
            c = p;
            p = HT.nodes[c].parent;
        }
        codes[i] = code.empty() ? "0" : code;
    }
}

// ========== 辅助函数：创建普通二叉树（用于遍历测试）==========
void CreateBiTreeChar(BiTree &T) {
    char ch;
    cin >> ch;
    if (ch == '#') {
        T = nullptr;
    } else {
        T = new BiTNode{string(1, ch), nullptr, nullptr};
        CreateBiTreeChar(T->lchild);
        CreateBiTreeChar(T->rchild);
    }
}

// ========== 测试函数 ==========
void TestInOrderTraverse() {
    BiTree tree;
    cout << "请输入建立二叉链表的序列（用#表示空，如ABC##DE#G##F###）：";
    CreateBiTreeChar(tree);

    cout << "\n中序遍历（递归）的结果为：";
    InOrderTraverseRecursive(tree);
    cout << "\n中序遍历（非递归）的结果为：";
    InOrderTraverseNonRecursive(tree);
    cout << endl;
}

void TestPostOrderTraverse() {
    BiTree tree;
    cout << "请输入建立二叉链表的序列（用#表示空，如ABC##DE#G##F###）：";
    CreateBiTreeChar(tree);

    cout << "\n后序遍历（递归）的结果为：";
    PostOrderTraverseRecursive(tree);
    cout << endl;
}

void TestExpressionTree() {
    cout << "请输入算术表达式（支持多位整数和负数，以#结尾，如：12+34*56# 或 (-3+4)*2#）：";
    string expr;
    cin >> expr;

    // 确保以#结尾
    if (expr.empty() || expr.back() != '#') {
        cout << "错误：表达式必须以 '#' 结尾！" << endl;
        return;
    }

    // 移除末尾的#，然后重新添加（确保解析正确）
    string realExpr = expr.substr(0, expr.size() - 1) + '#';

    BiTree T = nullptr;
    InitExpTree(T, realExpr);
    if (T) {
        cout << "表达式求值结果为：" << EvaluateExTree(T) << endl;
    }
}

void TestHuffmanTree() {
    HuffmanTree HT;
    int n;
    cout << "请输入哈夫曼树的叶子节点数：";
    cin >> n;
    if (n <= 0) {
        cout << "节点数必须大于0！" << endl;
        return;
    }

    InitHuffmanTree(HT, n);
    for (int i = 0; i < n; i++) {
        char ch;
        int w;
        cout << "请输入第 " << i + 1 << " 个字符及其权值（如 A 5）：";
        cin >> ch >> w;
        HT.nodes[i].data = ch;
        HT.nodes[i].weight = w;
    }

    CreateHuffmanTreeFromNodes(HT, n);
    vector<string> codes(n);
    HuffmanCode(HT, n, codes);

    cout << "\n--- 哈夫曼编码结果 ---" << endl;
    for (int i = 0; i < n; i++) {
        cout << "字符 '" << HT.nodes[i].data << "' (权值=" << HT.nodes[i].weight
             << ") 的编码: " << codes[i] << endl;
    }

    delete[] HT.nodes;
}

// ========== 主函数 ==========
int main() {
    int choice;
    cout << "=== 数据结构综合测试程序（表达式支持多位整数和负数）===" << endl;

    while (true) {
        cout << "\n请选择要测试的功能：";
        cout << "\n1. 二叉树的中序遍历（递归和非递归）";
        cout << "\n2. 二叉树的后序遍历（递归）";
        cout << "\n3. 哈夫曼树的构造和编码";
        cout << "\n4. 表达式树的构建和求值";
        cout << "\n0. 退出";
        cout << "\n请输入选项：";

        cin >> choice;
        cin.ignore();

        switch (choice) {
            case 1: TestInOrderTraverse(); break;
            case 2: TestPostOrderTraverse(); break;
            case 3: TestHuffmanTree(); break;
            case 4: TestExpressionTree(); break;
            case 0:
                cout << "程序已退出。" << endl;
                return 0;
            default:
                cout << "无效选项，请重新输入！" << endl;
        }
    }
}
```

### 第一节

第一节的内容。

### 第二节

第二节的内容。

## 第二章

第二章的内容。

### 第三节

第三节的内容。

# 结论

结论部分。
