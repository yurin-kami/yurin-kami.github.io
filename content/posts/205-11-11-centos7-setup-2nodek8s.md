---
title: "CentOS7部署双节点k8s集群作为云原生开发环境"
date: "2025-11-11"
tags: ["k8s", "centos7", "virtualmachine", "cloud native", "baseful"]
excerpt: "我将会使用CentOS7虚拟机配置阿里源部署使用containerd运行时的k8s集群，version=1.30.14"
---

# CentOS7部署k8s双节点集群

0. 预先准备

  - *配置好网络与ssh服务，关闭防火墙*
  
  - 配置selinux安全策略
    ```bash
    setenforce 0
    sed -i 's/SELINUX=enforcing/SELINUX=disabled/g' /etc/selinux/config
  	```
  	
  - 配置iptables规则
  	```bash
  	iptables -F
  	iptables -X
  	iptables -Z
  	iptables-save
  	```
  	
  - 配置主机名映射、ssh免密
  	```bash
  	hostnamectl set-hostname master/worker
  	echo "masterIp master" >> /etc/hosts
  	echo "workerIp worker" >> /etc/hosts
  	ssh-keygen
  	ssh-copy-id worker
  	scp /etc/hosts worker:/etc
  	```
  	
  - 关闭交换分区
  	```bash
  	swapoff -a
  	```
  	
  - 加载内核模块、开启ipv4转发
  	```bash
  	tee /etc/sysctl.d/k8s.conf <<EOF
  	net.bridge.brifge-nf-call-iptables = 1
  	net.bridge.brifge-nf-call-ip6tables = 1
  	net.ipv4.ip_forward = 1
  	EOF
  	sysctl --system
  	modprobe br_netfilter
  	scp /etc/sysctl.d/k8s.conf worker:/etc/sysctl.d/
  	sysctl --system
  	echo "modprobe br_netfilter" >/etc/sysconfig/modules/br_netfilter.modules && echo "modprobe ip_conntrack" >/etc/sysconfig/modules/ip_conntrack.modules && chmod 755 /etc/sysconfig/modules/br_netfilter.modules && chmod 755 /etc/sysconfig/modules/ip_conntrack.modules
  	```
  - 配置yum源
		```bash
		cd /etc/yum.repo.d/ && curl -O http://mirrors.aliyun.com/repo/Centos-7.repo && cd
		yum install -y wget vim bash-completion yum-utils
		yum-config-manager --add-repo http://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
		cat <<EOF | tee /etc/yum.repos.d/kubernetes.repo
		[kubernetes]
		name=Kubernetes
		baseurl=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/
		enabled=1
		gpgcheck=1
		gpgkey=https://mirrors.aliyun.com/kubernetes-new/core/stable/v1.30/rpm/repodata/repomd.xml.key
		```
		
  - 安装kubelet kubeadm kubectl containerd.io
		
  	```bash
  	yum -y install containerd.io kubelet kubectl kubeadm
  	```
  	
  - 配置containerd
  	```bash
  	containerd config default > /etc/containerd/config.toml
  	sed -i 's/pause\:3\.6/pause\:3\.9/g' /etc/containerd/config.toml
  	[
  	vim /etc/containerd/config.toml
  	plugins."io.containerd.runtime.v1.linux"
  	]
  	no_shim = false
  	runtime = "runc"
  	runtime_root = ""
  	shim = "containerd-shim"
  	shim_debug = false
  	cgroup_manager = "systemd"  # ✅ 添加这一行
  	scp /etc/containerd/config.toml worker:/etc/containerd
  	systemctl enable --now containerd
  
1. 安装集群
	```bash
	kubeadm init --apiserver-advertise-address=masterIp --image-repository=registry.aliyuncs.com/google_containers --kubernetes-version=v1.30.14 --service-cidr=10.96.0.0/12 --pod-network-cidr=10.244.0.0/16 -v
	#成功会输出：
	mkdir -p $HOME/.kube
    sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
    sudo chown $(id -u):$(id -g) $HOME/.kube/config
    kubectl apply -f https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml
	kubeadm join masterIp:6443 --token `token` --discovery-token-ca-cert-hash `hash`
	kubectl completion bash > /etc/bash_completion.d/kubectl
	```

3. 展示

   ![image-20251111231148913](https://cdn.jsdelivr.net/gh/yurin-kami/KamiBlogImages/images/image-20251111231148913.png)